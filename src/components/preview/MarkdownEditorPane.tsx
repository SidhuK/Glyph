import { MenuCircleIcon, SourceCodeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	useAISidebarContext,
	useEditorRegistration,
	useVault,
} from "../../contexts";
import { extractErrorMessage } from "../../lib/errorUtils";
import { splitYamlFrontmatter } from "../../lib/notePreview";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { normalizeRelPath } from "../../utils/path";
import {
	Calendar,
	Edit,
	Eye,
	FileText,
	List,
	RefreshCw,
	Save,
	Type,
} from "../Icons";
import { CanvasNoteInlineEditor } from "../editor/CanvasNoteInlineEditor";
import { CALLOUT_TYPES } from "../editor/ribbonButtonConfigs";
import type { CanvasInlineEditorMode } from "../editor/types";
import { Button } from "../ui/shadcn/button";

interface MarkdownEditorPaneProps {
	relPath: string;
	onDirtyChange?: (dirty: boolean) => void;
}

const markdownDocCache = new Map<string, string>();
const WORDS_PER_MINUTE = 200;

function countWords(text: string): number {
	const cleaned = text.trim();
	if (!cleaned) return 0;
	return cleaned.split(/\s+/u).length;
}

function countLines(text: string): number {
	if (!text.length) return 0;
	return text.split(/\r?\n/).length;
}

function formatReadingTime(words: number): string {
	if (words <= 0) return "0s";
	const totalSeconds = Math.ceil((words / WORDS_PER_MINUTE) * 60);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes <= 0) return `${seconds}s`;
	if (seconds === 0) return `${minutes}m`;
	return `${minutes}m ${seconds}s`;
}

export function MarkdownEditorPane({
	relPath,
	onDirtyChange,
}: MarkdownEditorPaneProps) {
	const [text, setText] = useState(() => markdownDocCache.get(relPath) ?? "");
	const [savedText, setSavedText] = useState(
		() => markdownDocCache.get(relPath) ?? "",
	);
	const [mode, setMode] = useState<CanvasInlineEditorMode>("rich");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [actionsOpen, setActionsOpen] = useState(false);
	const [lastSavedMtimeMs, setLastSavedMtimeMs] = useState<number | null>(null);
	const calloutInserterRef = useRef<((type: string) => void) | null>(null);
	const savedTextRef = useRef(savedText);
	const textRef = useRef(text);
	const mtimeRef = useRef<number | null>(lastSavedMtimeMs);
	const autosaveInFlightRef = useRef(false);
	const autosaveQueuedRef = useRef(false);
	const hasUserEditsRef = useRef(false);
	const externalSyncTimerRef = useRef<number | null>(null);
	const pendingExternalReloadRef = useRef(false);
	const { vaultPath } = useVault();
	const { aiEnabled, aiPanelOpen } = useAISidebarContext();

	const isDirty = text !== savedText;
	const stats = useMemo(() => {
		const { body } = splitYamlFrontmatter(text);
		const words = countWords(body);
		const characters = body.length;
		const lines = countLines(body);
		return {
			words,
			characters,
			lines,
			readingTime: formatReadingTime(words),
		};
	}, [text]);

	useEffect(() => {
		savedTextRef.current = savedText;
	}, [savedText]);

	useEffect(() => {
		textRef.current = text;
	}, [text]);

	useEffect(() => {
		mtimeRef.current = lastSavedMtimeMs;
	}, [lastSavedMtimeMs]);

	useEffect(() => {
		const cached = markdownDocCache.get(relPath) ?? "";
		setText(cached);
		setSavedText(cached);
		setLastSavedMtimeMs(null);
		hasUserEditsRef.current = false;
		setActionsOpen(false);
	}, [relPath]);

	useEffect(() => {
		if (vaultPath === null) {
			markdownDocCache.clear();
			return;
		}
		markdownDocCache.clear();
	}, [vaultPath]);

	const loadDoc = useCallback(async () => {
		setError("");
		try {
			const doc = await invoke("vault_read_text", { path: relPath });
			markdownDocCache.set(relPath, doc.text);
			setText((prev) => (prev === savedTextRef.current ? doc.text : prev));
			setSavedText(doc.text);
			setLastSavedMtimeMs(doc.mtime_ms);
			hasUserEditsRef.current = false;
		} catch (e) {
			setError(extractErrorMessage(e));
		}
	}, [relPath]);

	const loadDocFromExternalChange = useCallback(async () => {
		setError("");
		try {
			const doc = await invoke("vault_read_text", { path: relPath });
			if (
				doc.mtime_ms === mtimeRef.current &&
				doc.text === savedTextRef.current
			)
				return;
			markdownDocCache.set(relPath, doc.text);
			setText(doc.text);
			setSavedText(doc.text);
			setLastSavedMtimeMs(doc.mtime_ms);
			hasUserEditsRef.current = false;
		} catch (e) {
			setError(extractErrorMessage(e));
		}
	}, [relPath]);

	useEffect(() => {
		void loadDoc();
	}, [loadDoc]);

	const persistDoc = useCallback(
		async (path: string, nextText: string): Promise<boolean> => {
			const applySaveState = (saved: string, mtimeMs: number) => {
				if (path !== relPath) return;
				markdownDocCache.set(path, saved);
				setSavedText(saved);
				setLastSavedMtimeMs(mtimeMs);
				hasUserEditsRef.current = false;
			};

			setError("");
			try {
				const result = await invoke("vault_write_text", {
					path,
					text: nextText,
					base_mtime_ms: mtimeRef.current,
				});
				applySaveState(nextText, result.mtime_ms);
				return true;
			} catch (e) {
				const message = extractErrorMessage(e);
				const isConflict = message.includes(
					"conflict: on-disk file changed since it was opened",
				);
				if (!isConflict) {
					setError(message);
					return false;
				}

				// Conflict recovery: refresh latest mtime/content and retry save once.
				try {
					const latest = await invoke("vault_read_text", { path });
					if (latest.text === nextText) {
						applySaveState(nextText, latest.mtime_ms);
						return true;
					}
					const retry = await invoke("vault_write_text", {
						path,
						text: nextText,
						base_mtime_ms: latest.mtime_ms,
					});
					applySaveState(nextText, retry.mtime_ms);
					return true;
				} catch (retryError) {
					setError(extractErrorMessage(retryError));
					return false;
				}
			}
		},
		[relPath],
	);

	const onSave = useCallback(async () => {
		setSaving(true);
		try {
			await persistDoc(relPath, text);
		} finally {
			setSaving(false);
		}
	}, [persistDoc, relPath, text]);

	const runAutosave = useCallback(() => {
		if (autosaveInFlightRef.current) {
			autosaveQueuedRef.current = true;
			return;
		}

		const path = relPath;
		const snapshot = textRef.current;
		if (snapshot === savedTextRef.current) return;

		autosaveInFlightRef.current = true;
		void persistDoc(path, snapshot).then((ok) => {
			autosaveInFlightRef.current = false;
			if (autosaveQueuedRef.current) {
				autosaveQueuedRef.current = false;
				runAutosave();
				return;
			}
			if (ok && textRef.current !== savedTextRef.current) {
				runAutosave();
			}
		});
	}, [persistDoc, relPath]);

	useEffect(() => {
		if (!isDirty || !hasUserEditsRef.current) return;
		const timer = window.setTimeout(() => {
			runAutosave();
		}, 900);
		return () => window.clearTimeout(timer);
	}, [isDirty, runAutosave]);

	useEffect(() => {
		return () => {
			if (textRef.current === savedTextRef.current) return;
			runAutosave();
		};
	}, [runAutosave]);

	const handleExternalNoteChanged = useCallback(
		(payload: { rel_path: string }) => {
			const changed = normalizeRelPath(payload.rel_path);
			const current = normalizeRelPath(relPath);
			if (!changed || changed !== current) return;
			if (externalSyncTimerRef.current !== null) {
				window.clearTimeout(externalSyncTimerRef.current);
			}
			externalSyncTimerRef.current = window.setTimeout(() => {
				externalSyncTimerRef.current = null;
				if (isDirty || autosaveInFlightRef.current || saving) {
					pendingExternalReloadRef.current = true;
					return;
				}
				void loadDocFromExternalChange();
			}, 180);
		},
		[isDirty, loadDocFromExternalChange, relPath, saving],
	);

	useTauriEvent("notes:external_changed", handleExternalNoteChanged);

	useEffect(() => {
		if (!pendingExternalReloadRef.current) return;
		if (isDirty || saving) return;
		pendingExternalReloadRef.current = false;
		void loadDocFromExternalChange();
	}, [isDirty, loadDocFromExternalChange, saving]);

	useEffect(
		() => () => {
			if (externalSyncTimerRef.current !== null) {
				window.clearTimeout(externalSyncTimerRef.current);
			}
		},
		[],
	);

	// Register editor state for keyboard shortcuts
	const editorState = useMemo(
		() => ({
			isDirty,
			save: onSave,
		}),
		[isDirty, onSave],
	);
	useEditorRegistration(editorState);

	useEffect(() => {
		onDirtyChange?.(isDirty);
	}, [onDirtyChange, isDirty]);

	const canInsertCallouts = mode === "rich";
	const registerCalloutInserter = useCallback(
		(inserter: ((type: string) => void) | null) => {
			calloutInserterRef.current = inserter;
		},
		[],
	);

	return (
		<section className="filePreviewPane markdownEditorPane">
			<div className="markdownEditorFloatActions">
				<div className="markdownEditorActionsMenu">
					<Button
						type="button"
						variant="outline"
						size="icon-sm"
						className="markdownEditorMenuTrigger"
						onClick={() => setActionsOpen((prev) => !prev)}
						aria-label={
							actionsOpen ? "Close editor actions" : "Open editor actions"
						}
						title={actionsOpen ? "Close editor actions" : "Open editor actions"}
						aria-expanded={actionsOpen}
					>
						<HugeiconsIcon icon={MenuCircleIcon} size={14} />
					</Button>
					{actionsOpen ? (
						<div className="markdownEditorActionsPanel">
							<Button
								type="button"
								variant="ghost"
								size="xs"
								className="markdownEditorActionItem"
								data-active={mode === "rich"}
								onClick={() => {
									setMode("rich");
									setActionsOpen(false);
								}}
							>
								<Edit size={12} />
								Edit
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="xs"
								className="markdownEditorActionItem"
								data-active={mode === "preview"}
								onClick={() => {
									setMode("preview");
									setActionsOpen(false);
								}}
							>
								<Eye size={12} />
								Preview
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="xs"
								className="markdownEditorActionItem"
								data-active={mode === "plain"}
								onClick={() => {
									setMode("plain");
									setActionsOpen(false);
								}}
							>
								<HugeiconsIcon icon={SourceCodeIcon} size={12} />
								Raw
							</Button>
							{canInsertCallouts ? (
								<>
									<div className="markdownEditorActionDivider" />
									<div className="markdownEditorCalloutSection">
										<div className="markdownEditorCalloutLabel">Callouts</div>
										<div className="markdownEditorCalloutRow">
											{CALLOUT_TYPES.map((type) => (
												<Button
													key={type}
													type="button"
													variant="ghost"
													size="xs"
													className="markdownEditorCalloutChip"
													onClick={() => {
														calloutInserterRef.current?.(type);
														setActionsOpen(false);
													}}
													title={`Insert ${type === "Warn" ? "Warning" : type} callout`}
												>
													{type}
												</Button>
											))}
										</div>
									</div>
									<div className="markdownEditorActionDivider" />
								</>
							) : null}
							<Button
								type="button"
								variant="ghost"
								size="xs"
								className="markdownEditorActionItem"
								onClick={() => {
									void loadDoc();
									setActionsOpen(false);
								}}
								disabled={saving}
							>
								<RefreshCw size={12} />
								Reload
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="xs"
								className="markdownEditorActionItem"
								onClick={() => {
									void onSave();
									setActionsOpen(false);
								}}
								disabled={saving}
							>
								<Save size={12} />
								{saving ? "Saving" : "Save"}
							</Button>
						</div>
					) : null}
				</div>
			</div>
			{mode !== "preview" ? (
				<div
					className={[
						"markdownEditorStatsDock",
						aiEnabled && !aiPanelOpen ? "withAiFab" : "",
					]
						.filter(Boolean)
						.join(" ")}
					aria-label="Editor statistics"
				>
					<div className="markdownEditorStatsPill">
						<div
							className="markdownEditorStatsItem"
							title={`Words: ${stats.words.toLocaleString()}`}
							aria-label={`Words: ${stats.words.toLocaleString()}`}
						>
							<FileText size={13} aria-hidden />
							<span>{stats.words.toLocaleString()}</span>
						</div>
						<div
							className="markdownEditorStatsItem"
							title={`Characters: ${stats.characters.toLocaleString()}`}
							aria-label={`Characters: ${stats.characters.toLocaleString()}`}
						>
							<Type size={13} aria-hidden />
							<span>{stats.characters.toLocaleString()}</span>
						</div>
						<div
							className="markdownEditorStatsItem"
							title={`Lines: ${stats.lines.toLocaleString()}`}
							aria-label={`Lines: ${stats.lines.toLocaleString()}`}
						>
							<List size={13} aria-hidden />
							<span>{stats.lines.toLocaleString()}</span>
						</div>
						<div
							className="markdownEditorStatsItem"
							title={`Reading time: ${stats.readingTime}`}
							aria-label={`Reading time: ${stats.readingTime}`}
						>
							<Calendar size={13} aria-hidden />
							<span>{stats.readingTime}</span>
						</div>
					</div>
				</div>
			) : null}

			{error ? (
				<div className="filePreviewMeta">
					<div className="filePreviewHint">{error}</div>
				</div>
			) : null}

			{!error ? (
				<div className="filePreviewTextWrap markdownEditorContent">
					<div className="markdownEditorCenter">
						<CanvasNoteInlineEditor
							key={relPath}
							markdown={text}
							relPath={relPath}
							mode={mode}
							onModeChange={setMode}
							onChange={(nextText) => {
								hasUserEditsRef.current = true;
								setText(nextText);
							}}
							onRegisterCalloutInserter={registerCalloutInserter}
						/>
					</div>
				</div>
			) : null}
		</section>
	);
}
