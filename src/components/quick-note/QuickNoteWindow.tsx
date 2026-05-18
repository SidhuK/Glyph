import { emit } from "@tauri-apps/api/event";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { isMissingFileError } from "../../lib/fsErrors";
import { loadSettings, reloadFromDisk } from "../../lib/settings";
import { type FsEntry, invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { basename, parentDir } from "../../utils/path";
import { ChevronDown, FileText, Save } from "../Icons";

const QUICK_NOTE_TARGET_VALUE = "__quick-note-today__";
const MARKDOWN_TARGET_LIMIT = 2000;

interface QuickNoteTarget {
	value: string;
	path: string;
	label: string;
	detail: string;
}

interface QuickNoteTargetGroup {
	folder: string;
	label: string;
	targets: QuickNoteTarget[];
}

function pad(value: number): string {
	return value.toString().padStart(2, "0");
}

function dateStamp(date = new Date()): string {
	return [
		date.getFullYear(),
		pad(date.getMonth() + 1),
		pad(date.getDate()),
	].join("-");
}

function quickNotePath(folder: string): string {
	const fileName = `${dateStamp()} - Quick Note.md`;
	return folder ? `${folder}/${fileName}` : fileName;
}

function appendMarkdown(existing: string, entry: string): string {
	const trimmedExisting = existing.trimEnd();
	if (!trimmedExisting) return `${entry}\n`;
	return `${trimmedExisting}\n\n${entry}\n`;
}

async function appendQuickNote(folder: string, text: string): Promise<string> {
	const path = quickNotePath(folder);
	return appendQuickNoteToPath(path, text);
}

async function appendQuickNoteToPath(
	path: string,
	text: string,
): Promise<string> {
	try {
		const doc = await invoke("space_read_text", { path });
		await invoke("space_write_text", {
			path,
			text: appendMarkdown(doc.text, text.trim()),
			base_mtime_ms: doc.mtime_ms,
		});
		return path;
	} catch (cause) {
		if (!isMissingFileError(cause)) throw cause;
		await invoke("space_write_text", {
			path,
			text: `${text.trim()}\n`,
			base_mtime_ms: null,
		});
		return path;
	}
}

function savedLabel(path: string) {
	const name = basename(path);
	return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

function targetDetail(path: string) {
	return parentDir(path) || "Space root";
}

function quickNoteTarget(folder: string): QuickNoteTarget {
	const path = quickNotePath(folder);
	return {
		value: QUICK_NOTE_TARGET_VALUE,
		path,
		label: "Today's quick note",
		detail: targetDetail(path),
	};
}

function fileTarget(entry: FsEntry): QuickNoteTarget {
	return {
		value: entry.rel_path,
		path: entry.rel_path,
		label: savedLabel(entry.rel_path),
		detail: targetDetail(entry.rel_path),
	};
}

function sortMarkdownFiles(files: FsEntry[]): FsEntry[] {
	return [...files].sort((a, b) => {
		const folderCompare = parentDir(a.rel_path).localeCompare(
			parentDir(b.rel_path),
		);
		if (folderCompare !== 0) return folderCompare;
		return savedLabel(a.rel_path).localeCompare(savedLabel(b.rel_path));
	});
}

function groupTargets(targets: QuickNoteTarget[]): QuickNoteTargetGroup[] {
	const groups = new Map<string, QuickNoteTarget[]>();
	for (const target of targets) {
		const folder = parentDir(target.path);
		groups.set(folder, [...(groups.get(folder) ?? []), target]);
	}
	return [...groups.entries()].map(([folder, groupTargets]) => ({
		folder,
		label: folder || "Space root",
		targets: groupTargets,
	}));
}

export function QuickNoteWindow() {
	const [folder, setFolder] = useState("Quick Notes");
	const [draft, setDraft] = useState("");
	const [status, setStatus] = useState("");
	const [saving, setSaving] = useState(false);
	const [targetValue, setTargetValue] = useState(QUICK_NOTE_TARGET_VALUE);
	const [targetsOpen, setTargetsOpen] = useState(false);
	const [fileTargets, setFileTargets] = useState<QuickNoteTarget[]>([]);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const targetSelectorRef = useRef<HTMLDivElement | null>(null);
	const targetTriggerRef = useRef<HTMLButtonElement | null>(null);

	const hasText = draft.trim().length > 0;
	const defaultTarget = useMemo(() => quickNoteTarget(folder), [folder]);
	const groupedFileTargets = useMemo(
		() => groupTargets(fileTargets),
		[fileTargets],
	);
	const selectedTarget =
		targetValue === QUICK_NOTE_TARGET_VALUE
			? defaultTarget
			: (fileTargets.find((target) => target.value === targetValue) ??
				defaultTarget);
	const isMac =
		navigator.platform.toLowerCase().includes("mac") ||
		navigator.userAgent.includes("Mac");
	const shortcutLabel = isMac ? "⌘+Enter" : "Ctrl+Enter";
	const shortcutModifierLabel = isMac ? "⌘" : "Ctrl";

	const chooseTarget = useCallback((value: string) => {
		setTargetValue(value);
		setTargetsOpen(false);
		window.setTimeout(() => textareaRef.current?.focus(), 20);
	}, []);

	const focusTargetOption = useCallback((position: "first" | "last") => {
		window.requestAnimationFrame(() => {
			const options =
				targetSelectorRef.current?.querySelectorAll<HTMLButtonElement>(
					".quickNoteTargetMenu .quickNoteTargetOption",
				);
			const nextOption =
				position === "first" ? options?.[0] : options?.[options.length - 1];
			nextOption?.focus();
		});
	}, []);

	const refreshSettings = useCallback(async (withReload = false) => {
		if (withReload) await reloadFromDisk();
		const settings = await loadSettings();
		const nextFolder = settings.quickNotes.folder;
		setFolder(nextFolder);
		return nextFolder;
	}, []);

	const refreshTargets = useCallback(async (nextFolder: string) => {
		try {
			const files = await invoke("space_list_markdown_files", {
				recursive: true,
				limit: MARKDOWN_TARGET_LIMIT,
			});
			const defaultPath = quickNotePath(nextFolder);
			setFileTargets(
				sortMarkdownFiles(files)
					.filter((entry) => entry.rel_path !== defaultPath)
					.map(fileTarget),
			);
		} catch (cause) {
			setStatus(cause instanceof Error ? cause.message : String(cause));
		}
	}, []);

	useEffect(() => {
		void refreshSettings()
			.then((nextFolder) => refreshTargets(nextFolder))
			.catch(() => {});
		const focusTimer = window.setTimeout(
			() => textareaRef.current?.focus(),
			80,
		);
		return () => window.clearTimeout(focusTimer);
	}, [refreshSettings, refreshTargets]);

	useEffect(() => {
		if (!targetsOpen) return;
		const handlePointerDown = (event: PointerEvent) => {
			if (
				event.target instanceof Node &&
				targetSelectorRef.current?.contains(event.target)
			) {
				return;
			}
			setTargetsOpen(false);
		};
		document.addEventListener("pointerdown", handlePointerDown);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown);
		};
	}, [targetsOpen]);

	useTauriEvent("settings:updated", (payload) => {
		if (typeof payload.quickNotes?.folder === "string") {
			const nextFolder = payload.quickNotes.folder;
			setFolder(nextFolder);
			void refreshTargets(nextFolder);
		}
	});

	const save = useCallback(async () => {
		const text = draft.trim();
		if (!text || saving) return;
		setSaving(true);
		setStatus("");
		try {
			const path =
				selectedTarget.value === QUICK_NOTE_TARGET_VALUE
					? await appendQuickNote(folder, text)
					: await appendQuickNoteToPath(selectedTarget.path, text);
			setDraft("");
			setStatus(`Saved ${savedLabel(path)}`);
			void emit("quick-note:open_note", { path }).catch(() => {});
			void refreshTargets(folder);
			window.setTimeout(() => setStatus(""), 1600);
			window.setTimeout(() => textareaRef.current?.focus(), 20);
		} catch (cause) {
			setStatus(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setSaving(false);
		}
	}, [draft, folder, refreshTargets, saving, selectedTarget]);

	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		const primary = event.metaKey || event.ctrlKey;
		if (event.key === "Escape") {
			event.preventDefault();
			if (targetsOpen) {
				setTargetsOpen(false);
				return;
			}
			void invoke("hide_quick_note_window");
			return;
		}
		if (primary && event.key === "Enter") {
			event.preventDefault();
			void save();
		}
	};

	const handleTargetTriggerKeyDown = (
		event: KeyboardEvent<HTMLButtonElement>,
	) => {
		if (event.key === "Escape") {
			event.preventDefault();
			setTargetsOpen(false);
			return;
		}
		if (
			event.key === "Enter" ||
			event.key === " " ||
			event.key === "ArrowDown" ||
			event.key === "ArrowUp"
		) {
			event.preventDefault();
			setTargetsOpen(true);
			void refreshTargets(folder);
			if (event.key === "ArrowDown") {
				focusTargetOption("first");
			} else if (event.key === "ArrowUp") {
				focusTargetOption("last");
			}
		}
	};

	const handleTargetOptionKeyDown = (
		event: KeyboardEvent<HTMLButtonElement>,
	) => {
		if (event.key !== "Escape") return;
		event.preventDefault();
		setTargetsOpen(false);
		window.setTimeout(() => targetTriggerRef.current?.focus(), 20);
	};

	return (
		<div className="quickNoteRoot">
			<div className="quickNoteDragHandle" data-tauri-drag-region />
			<textarea
				ref={textareaRef}
				className="quickNoteTextarea"
				value={draft}
				placeholder="Write a quick note"
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={handleKeyDown}
				spellCheck
			/>
			<div className="quickNoteEditorChrome">
				<div className="quickNoteTargetGroup">
					<FileText size={14} aria-hidden="true" />
					<div className="quickNoteTargetSelectWrap" ref={targetSelectorRef}>
						<button
							ref={targetTriggerRef}
							type="button"
							className="quickNoteTargetTrigger"
							aria-label="Quick note destination"
							aria-expanded={targetsOpen}
							aria-haspopup="listbox"
							title={selectedTarget.path}
							onClick={() => {
								setTargetsOpen((open) => !open);
								void refreshTargets(folder);
							}}
							onKeyDown={handleTargetTriggerKeyDown}
						>
							<span className="quickNoteTargetTriggerText">
								{selectedTarget.label}
							</span>
							<span className="quickNoteTargetTriggerDetail">
								{selectedTarget.detail}
							</span>
							<ChevronDown size={12} aria-hidden="true" />
						</button>
						{targetsOpen ? (
							<div
								className="quickNoteTargetMenu"
								aria-label="Quick note destination"
							>
								<button
									type="button"
									className={
										selectedTarget.value === defaultTarget.value
											? "quickNoteTargetOption is-selected"
											: "quickNoteTargetOption"
									}
									aria-selected={selectedTarget.value === defaultTarget.value}
									onClick={() => chooseTarget(defaultTarget.value)}
									onKeyDown={handleTargetOptionKeyDown}
								>
									<span className="quickNoteTargetOptionLabel">
										{defaultTarget.label}
									</span>
									<span className="quickNoteTargetOptionDetail">
										{defaultTarget.detail}
									</span>
								</button>
								{groupedFileTargets.map((group) => (
									<div
										key={group.folder || "__root__"}
										className="quickNoteTargetMenuGroup"
									>
										<div className="quickNoteTargetMenuGroupLabel">
											{group.label}
										</div>
										{group.targets.map((target) => (
											<button
												key={target.value}
												type="button"
												className={
													selectedTarget.value === target.value
														? "quickNoteTargetOption is-selected"
														: "quickNoteTargetOption"
												}
												aria-selected={selectedTarget.value === target.value}
												onClick={() => chooseTarget(target.value)}
												onKeyDown={handleTargetOptionKeyDown}
											>
												<span className="quickNoteTargetOptionLabel">
													{target.label}
												</span>
											</button>
										))}
									</div>
								))}
							</div>
						) : null}
					</div>
				</div>
				<div className="quickNoteActionGroup">
					<div className="quickNoteStatus" aria-live="polite">
						{status}
					</div>
					<button
						type="button"
						className="quickNoteSaveButton"
						aria-label={saving ? "Saving quick note" : "Save quick note"}
						title={
							saving
								? "Saving quick note"
								: `Save quick note (${shortcutLabel})`
						}
						disabled={saving || !hasText}
						onClick={() => void save()}
					>
						<Save size={16} />
						<span className="quickNoteSaveLabel">Save</span>
						<span className="commandPaletteShortcut" aria-hidden="true">
							<kbd>
								<span className="commandPaletteShortcutCombo">
									<span className="commandPaletteShortcutPart">
										{shortcutModifierLabel}
									</span>
									<span className="commandPaletteShortcutPart">↵</span>
								</span>
							</kbd>
						</span>
					</button>
				</div>
			</div>
		</div>
	);
}
