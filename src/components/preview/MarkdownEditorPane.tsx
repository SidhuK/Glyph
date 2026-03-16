import {
	MenuCircleIcon,
	SourceCodeIcon,
	TimeQuarter02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	useAISidebarContext,
	useEditorRegistration,
	useSpace,
} from "../../contexts";
import { extractErrorMessage } from "../../lib/errorUtils";
import { splitYamlFrontmatter } from "../../lib/notePreview";
import { type TextFileDoc, invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { countWords, formatReadingTime } from "../../lib/textStats";
import { normalizeRelPath } from "../../utils/path";
import { Edit, Eye, FileText, RefreshCw, Save, Type } from "../Icons";
import { CanvasNoteInlineEditor } from "../editor/CanvasNoteInlineEditor";
import { CALLOUT_TYPES } from "../editor/ribbonButtonConfigs";
import type { CanvasInlineEditorMode } from "../editor/types";
import { Button } from "../ui/shadcn/button";
import { InstantMarkdownPreview } from "./InstantMarkdownPreview";

interface MarkdownEditorPaneProps {
	relPath: string;
	onDirtyChange?: (dirty: boolean) => void;
	initialDoc?: TextFileDoc | null;
	initialError?: string;
}

type StatsLayout = "full" | "collapsed" | "hidden";
type SyncPulse = "saved" | "reloaded" | null;

const markdownDocCache = new Map<string, string>();

function isVisibleElement(element: HTMLElement | null): boolean {
	if (!element) return false;
	const style = window.getComputedStyle(element);
	return (
		style.display !== "none" &&
		style.visibility !== "hidden" &&
		Number.parseFloat(style.opacity || "1") > 0.02
	);
}

function rectsOverlap(a: DOMRect, b: DOMRect, padding = 0): boolean {
	return !(
		a.right - padding <= b.left ||
		a.left + padding >= b.right ||
		a.bottom - padding <= b.top ||
		a.top + padding >= b.bottom
	);
}

export function MarkdownEditorPane({
	relPath,
	onDirtyChange,
	initialDoc = null,
	initialError = "",
}: MarkdownEditorPaneProps) {
	const [text, setText] = useState(
		() => initialDoc?.text ?? markdownDocCache.get(relPath) ?? "",
	);
	const [savedText, setSavedText] = useState(
		() => initialDoc?.text ?? markdownDocCache.get(relPath) ?? "",
	);
	const [mode, setMode] = useState<CanvasInlineEditorMode>("rich");
	const [saving, setSaving] = useState(false);
	const [autosaveBusy, setAutosaveBusy] = useState(false);
	const [error, setError] = useState(initialError);
	const [actionsOpen, setActionsOpen] = useState(false);
	const [lastSavedMtimeMs, setLastSavedMtimeMs] = useState<number | null>(
		initialDoc?.mtime_ms ?? null,
	);
	const [syncPulse, setSyncPulse] = useState<SyncPulse>(null);
	const [editorHydrated, setEditorHydrated] = useState(false);
	const calloutInserterRef = useRef<((type: string) => void) | null>(null);
	const savedTextRef = useRef(savedText);
	const textRef = useRef(text);
	const mtimeRef = useRef<number | null>(lastSavedMtimeMs);
	const autosaveInFlightRef = useRef(false);
	const autosaveQueuedRef = useRef(false);
	const hasUserEditsRef = useRef(false);
	const externalSyncTimerRef = useRef<number | null>(null);
	const syncPulseTimerRef = useRef<number | null>(null);
	const pendingExternalReloadRef = useRef(false);
	const paneRef = useRef<HTMLElement | null>(null);
	const statsDockRef = useRef<HTMLDivElement | null>(null);
	const { spacePath } = useSpace();
	const previousSpacePathRef = useRef<string | null>(spacePath);
	const { aiEnabled, aiPanelOpen } = useAISidebarContext();
	const shouldReduceMotion = useReducedMotion();

	const isDirty = text !== savedText;
	const [statsLayout, setStatsLayout] = useState<StatsLayout>("full");
	const stats = useMemo(() => {
		const { body } = splitYamlFrontmatter(text);
		const words = countWords(body);
		const characters = body.length;
		return {
			words,
			characters,
			readingTime: formatReadingTime(words),
		};
	}, [text]);

	const flashSyncPulse = useCallback((next: Exclude<SyncPulse, null>) => {
		if (syncPulseTimerRef.current !== null) {
			window.clearTimeout(syncPulseTimerRef.current);
		}
		setSyncPulse(next);
		syncPulseTimerRef.current = window.setTimeout(() => {
			syncPulseTimerRef.current = null;
			setSyncPulse(null);
		}, 1400);
	}, []);

	const saveSignal = useMemo(() => {
		if (saving || autosaveBusy) {
			return {
				state: "saving",
				label: "Saving",
				description: "Writing changes to disk",
			} as const;
		}
		if (isDirty) {
			return {
				state: "dirty",
				label: "Edited",
				description: "Unsaved changes",
			} as const;
		}
		if (syncPulse === "reloaded") {
			return {
				state: "reloaded",
				label: "Fresh",
				description: "Content reloaded",
			} as const;
		}
		if (syncPulse === "saved") {
			return {
				state: "saved-fresh",
				label: "Saved",
				description: "Changes saved",
			} as const;
		}
		return {
			state: lastSavedMtimeMs ? "saved" : "ready",
			label: lastSavedMtimeMs ? "Saved" : "Ready",
			description: lastSavedMtimeMs ? "All changes saved" : "Editor ready",
		} as const;
	}, [autosaveBusy, isDirty, lastSavedMtimeMs, saving, syncPulse]);

	const syncStatsLayout = useCallback(() => {
		if (mode === "preview") {
			setStatsLayout("full");
			return;
		}
		const pane = paneRef.current;
		const dock = statsDockRef.current;
		if (!pane || !dock) return;

		const width = pane.clientWidth;
		const ribbon = pane.querySelector(
			".rfNodeNoteEditorRibbonBottom",
		) as HTMLElement | null;
		const ribbonVisible = isVisibleElement(ribbon);

		let next: StatsLayout = "full";
		if (width < 1160) next = "collapsed";
		if (width < 860) next = "hidden";

		if (ribbonVisible && ribbon) {
			const dockRect = dock.getBoundingClientRect();
			const ribbonRect = ribbon.getBoundingClientRect();
			if (rectsOverlap(dockRect, ribbonRect, 6)) {
				next = "collapsed";
				if (width < 1040) next = "hidden";
			}
		}

		setStatsLayout((prev) => (prev === next ? prev : next));
	}, [mode]);

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
		const cached = initialDoc?.text ?? markdownDocCache.get(relPath) ?? "";
		setText(cached);
		setSavedText(cached);
		setLastSavedMtimeMs(initialDoc?.mtime_ms ?? null);
		setSyncPulse(null);
		setEditorHydrated((prev) => prev && cached.length > 0);
		hasUserEditsRef.current = false;
		setError(initialError);
		setActionsOpen(false);
		if (initialDoc) {
			markdownDocCache.set(relPath, initialDoc.text);
		}
	}, [initialDoc, initialError, relPath]);

	useEffect(() => {
		if (previousSpacePathRef.current === spacePath) return;
		previousSpacePathRef.current = spacePath;
		if (spacePath === null) {
			markdownDocCache.clear();
			return;
		}
		markdownDocCache.clear();
	}, [spacePath]);

	useEffect(() => {
		if (mode === "plain" || !text || error) return;
		if (editorHydrated) return;

		let cancelled = false;
		let timer: number | null = null;
		const hydrate = () => {
			if (!cancelled) {
				setEditorHydrated(true);
			}
		};
		const requestIdle = window.requestIdleCallback;
		const cancelIdle = window.cancelIdleCallback;

		if (typeof requestIdle === "function" && typeof cancelIdle === "function") {
			const idleId = requestIdle(hydrate, { timeout: 120 });
			return () => {
				cancelled = true;
				cancelIdle(idleId);
			};
		}

		timer = window.setTimeout(hydrate, 32);
		return () => {
			cancelled = true;
			if (timer !== null) {
				window.clearTimeout(timer);
			}
		};
	}, [editorHydrated, error, mode, text]);

	const loadDoc = useCallback(
		async (showRefreshFeedback = false) => {
			setError("");
			try {
				const doc = await invoke("space_read_text", { path: relPath });
				markdownDocCache.set(relPath, doc.text);
				setText((prev) => (prev === savedTextRef.current ? doc.text : prev));
				setSavedText(doc.text);
				setLastSavedMtimeMs(doc.mtime_ms);
				hasUserEditsRef.current = false;
				if (showRefreshFeedback) {
					flashSyncPulse("reloaded");
				}
			} catch (e) {
				setError(extractErrorMessage(e));
			}
		},
		[flashSyncPulse, relPath],
	);

	const loadDocFromExternalChange = useCallback(async () => {
		setError("");
		try {
			const doc = await invoke("space_read_text", { path: relPath });
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
		if (initialDoc) return;
		void loadDoc();
	}, [initialDoc, loadDoc]);

	const persistDoc = useCallback(
		async (path: string, nextText: string): Promise<boolean> => {
			const applySaveState = (saved: string, mtimeMs: number) => {
				if (path !== relPath) return;
				markdownDocCache.set(path, saved);
				setSavedText(saved);
				setLastSavedMtimeMs(mtimeMs);
				hasUserEditsRef.current = false;
				flashSyncPulse("saved");
			};

			setError("");
			try {
				const result = await invoke("space_write_text", {
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
					const latest = await invoke("space_read_text", { path });
					if (latest.text === nextText) {
						applySaveState(nextText, latest.mtime_ms);
						return true;
					}
					const retry = await invoke("space_write_text", {
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
		[flashSyncPulse, relPath],
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
		setAutosaveBusy(true);
		void persistDoc(path, snapshot).then((ok) => {
			autosaveInFlightRef.current = false;
			setAutosaveBusy(false);
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
			if (syncPulseTimerRef.current !== null) {
				window.clearTimeout(syncPulseTimerRef.current);
			}
		},
		[],
	);

	// Register editor state for keyboard shortcuts
	const editorState = useMemo(
		() => ({
			relPath,
			isDirty,
			save: onSave,
			getMarkdown: () => textRef.current,
		}),
		[isDirty, onSave, relPath],
	);
	useEditorRegistration(editorState);

	useEffect(() => {
		onDirtyChange?.(isDirty);
	}, [onDirtyChange, isDirty]);

	useEffect(() => {
		if (mode === "preview") return;
		const pane = paneRef.current;
		if (!pane) return;

		let raf = 0;
		const schedule = () => {
			if (raf) window.cancelAnimationFrame(raf);
			raf = window.requestAnimationFrame(syncStatsLayout);
		};

		const resizeObserver = new ResizeObserver(schedule);
		resizeObserver.observe(pane);
		const editorRoot = pane.querySelector(
			".rfNodeNoteEditor",
		) as HTMLElement | null;
		const ribbon = pane.querySelector(
			".rfNodeNoteEditorRibbonBottom",
		) as HTMLElement | null;
		if (editorRoot) resizeObserver.observe(editorRoot);
		if (ribbon) resizeObserver.observe(ribbon);

		const mutationObserver = new MutationObserver(schedule);
		mutationObserver.observe(pane, {
			attributes: true,
			childList: true,
			subtree: true,
			attributeFilter: ["class", "style"],
		});

		window.addEventListener("resize", schedule);
		schedule();

		return () => {
			if (raf) window.cancelAnimationFrame(raf);
			window.removeEventListener("resize", schedule);
			resizeObserver.disconnect();
			mutationObserver.disconnect();
		};
	}, [mode, syncStatsLayout]);

	const canInsertCallouts = mode === "rich";
	const shouldRenderInstantPreview =
		!editorHydrated && mode !== "plain" && Boolean(text) && !error;
	const registerCalloutInserter = useCallback(
		(inserter: ((type: string) => void) | null) => {
			calloutInserterRef.current = inserter;
		},
		[],
	);

	return (
		<section className="filePreviewPane markdownEditorPane" ref={paneRef}>
			<div className="markdownEditorFloatActions">
				<div className="markdownEditorActionsMenu">
					<Button
						type="button"
						variant="outline"
						size="icon-sm"
						className="markdownEditorMenuTrigger"
						data-open={actionsOpen ? "true" : "false"}
						onClick={() => setActionsOpen((prev) => !prev)}
						aria-label={
							actionsOpen ? "Close editor actions" : "Open editor actions"
						}
						title={actionsOpen ? "Close editor actions" : "Open editor actions"}
						aria-expanded={actionsOpen}
					>
						<HugeiconsIcon icon={MenuCircleIcon} size={14} />
					</Button>
					<AnimatePresence initial={false}>
						{actionsOpen ? (
							<m.div
								className="markdownEditorActionsPanel"
								initial={
									shouldReduceMotion
										? false
										: { opacity: 0, y: -6, scale: 0.98 }
								}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								exit={
									shouldReduceMotion
										? { opacity: 0 }
										: { opacity: 0, y: -4, scale: 0.985 }
								}
								transition={
									shouldReduceMotion
										? { duration: 0 }
										: {
												type: "spring",
												stiffness: 420,
												damping: 34,
											}
								}
							>
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
										void loadDoc(true);
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
							</m.div>
						) : null}
					</AnimatePresence>
				</div>
			</div>
			{mode !== "preview" ? (
				<m.div
					ref={statsDockRef}
					className={[
						"markdownEditorStatsDock",
						aiEnabled && !aiPanelOpen ? "withAiFab" : "",
						statsLayout === "collapsed" ? "is-collapsed" : "",
						statsLayout === "hidden" ? "is-hidden" : "",
					]
						.filter(Boolean)
						.join(" ")}
					initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={
						shouldReduceMotion
							? { duration: 0 }
							: { type: "spring", stiffness: 380, damping: 32 }
					}
					aria-label="Editor statistics"
				>
					<div
						className="markdownEditorStatsPill"
						data-save-state={saveSignal.state}
					>
						<div
							className="markdownEditorStatsItem"
							data-metric="words"
							title={`Words: ${stats.words.toLocaleString()}`}
							aria-label={`Words: ${stats.words.toLocaleString()}`}
						>
							<FileText size={13} aria-hidden />
							<span>{stats.words.toLocaleString()}</span>
						</div>
						<div
							className="markdownEditorStatsItem"
							data-metric="characters"
							title={`Characters: ${stats.characters.toLocaleString()}`}
							aria-label={`Characters: ${stats.characters.toLocaleString()}`}
						>
							<Type size={13} aria-hidden />
							<span>{stats.characters.toLocaleString()}</span>
						</div>
						<div
							className="markdownEditorStatsItem"
							data-metric="reading-time"
							title={`Reading time: ${stats.readingTime}`}
							aria-label={`Reading time: ${stats.readingTime}`}
						>
							<HugeiconsIcon icon={TimeQuarter02Icon} size={13} aria-hidden />
							<span>{stats.readingTime}</span>
						</div>
					</div>
				</m.div>
			) : null}

			{error ? (
				<div className="filePreviewMeta">
					<div className="filePreviewHint">{error}</div>
				</div>
			) : null}

			{!error ? (
				<div className="filePreviewTextWrap markdownEditorContent">
					<div className="markdownEditorCenter">
						{shouldRenderInstantPreview ? (
							<div
								onPointerDown={() => setEditorHydrated(true)}
								onFocusCapture={() => setEditorHydrated(true)}
							>
								<InstantMarkdownPreview markdown={text} />
							</div>
						) : (
							<CanvasNoteInlineEditor
								markdown={text}
								relPath={relPath}
								mode={mode}
								onModeChange={setMode}
								onChange={(nextText) => {
									hasUserEditsRef.current = true;
									setText(nextText);
								}}
								deferHeavyFeatures={!editorHydrated}
								onRegisterCalloutInserter={registerCalloutInserter}
							/>
						)}
					</div>
				</div>
			) : null}
		</section>
	);
}
