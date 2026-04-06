import {
	MenuCircleIcon,
	SourceCodeIcon,
	TimeQuarter02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Editor } from "@tiptap/react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	useAISidebarContext,
	useEditorRegistration,
	useSpace,
	useUILayoutContext,
} from "../../contexts";
import {
	FORCE_NOTE_EDIT_MODE_EVENT,
	type ForceNoteEditModeDetail,
	ZEN_MODE_WILL_TOGGLE_EVENT,
	type ZenModeWillToggleDetail,
} from "../../lib/appEvents";
import { extractErrorMessage } from "../../lib/errorUtils";
import { splitYamlFrontmatter } from "../../lib/notePreview";
import { type NoteTaskSummary, type TextFileDoc, invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { countWords, formatReadingTime } from "../../lib/textStats";
import { setPrefetchedNote } from "../../lib/navigationPrefetch";
import { normalizeRelPath } from "../../utils/path";
import { Edit, Eye, FileText, RefreshCw, Save, Type } from "../Icons";
import { CanvasNoteInlineEditor } from "../editor/CanvasNoteInlineEditor";
import { FloatingTOC } from "../editor/FloatingTOC";
import { CALLOUT_TYPES } from "../editor/ribbonButtonConfigs";
import { TaskProgressIndicator } from "../tasks/TaskProgressIndicator";
import type { CanvasInlineEditorMode } from "../editor/types";
import { Button } from "../ui/shadcn/button";
import {
	clearMarkdownDocCache,
	getCachedMarkdownDoc,
	peekCachedMarkdownDoc,
} from "./markdownCache";

interface MarkdownEditorPaneProps {
	relPath: string;
	onDirtyChange?: (dirty: boolean) => void;
	initialDoc?: TextFileDoc | null;
	initialError?: string;
}

type StatsLayout = "full" | "collapsed" | "hidden";
type SyncPulse = "saved" | "reloaded" | null;

const EMPTY_TASK_SUMMARY: NoteTaskSummary = {
	total_count: 0,
	completed_count: 0,
	open_count: 0,
};

function summarizeTasksFromMarkdown(markdown: string): NoteTaskSummary {
	let total_count = 0;
	let completed_count = 0;

	for (const line of markdown.split(/\r?\n/)) {
		const match = line.match(/^\s*[-*+] \[([ xX])\] /);
		if (!match) continue;
		total_count += 1;
		if (match[1].toLowerCase() === "x") {
			completed_count += 1;
		}
	}

	return {
		total_count,
		completed_count,
		open_count: total_count - completed_count,
	};
}

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
	const initialText = initialDoc?.text ?? peekCachedMarkdownDoc(relPath) ?? "";
	const [text, setText] = useState(initialText);
	const [savedText, setSavedText] = useState(initialText);
	const [mode, setMode] = useState<CanvasInlineEditorMode>("rich");
	const [saving, setSaving] = useState(false);
	const [autosaveBusy, setAutosaveBusy] = useState(false);
	const [error, setError] = useState(() => initialError || "");
	const [actionsOpen, setActionsOpen] = useState(false);
	const [lastSavedMtimeMs, setLastSavedMtimeMs] = useState<number | null>(
		initialDoc?.mtime_ms ?? null,
	);
	const [syncPulse, setSyncPulse] = useState<SyncPulse>(null);
	const [taskSummary, setTaskSummary] =
		useState<NoteTaskSummary>(EMPTY_TASK_SUMMARY);
	const calloutInserterRef = useRef<((type: string) => void) | null>(null);
	const savedTextRef = useRef(savedText);
	const textRef = useRef(text);
	const mtimeRef = useRef<number | null>(lastSavedMtimeMs);
	const documentSessionRef = useRef(0);
	const mountedRef = useRef(true);
	const saveRequestTokenRef = useRef(0);
	const autosaveInFlightRef = useRef(false);
	const autosaveQueuedRef = useRef(false);
	const hasUserEditsRef = useRef(false);
	const externalSyncTimerRef = useRef<number | null>(null);
	const syncPulseTimerRef = useRef<number | null>(null);
	const taskSummaryTimerRef = useRef<number | null>(null);
	const taskSummaryRequestTokenRef = useRef(0);
	const pendingExternalReloadRef = useRef(false);
	const paneRef = useRef<HTMLElement | null>(null);
	const contentScrollRef = useRef<HTMLDivElement | null>(null);
	const statsDockRef = useRef<HTMLDivElement | null>(null);
	const { spacePath } = useSpace();
	const previousSpacePathRef = useRef<string | null>(spacePath);
	const pendingZenViewportAnchorRef = useRef<{
		topWithinViewport: number;
		scrollTop: number;
	} | null>(null);
	const [tocEditor, setTocEditor] = useState<Editor | null>(null);
	const { showToc, zenModeActive } = useUILayoutContext();
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
	const fallbackTaskSummary = useMemo(
		() => summarizeTasksFromMarkdown(text),
		[text],
	);
	const visibleTaskSummary =
		taskSummary.total_count > 0 || fallbackTaskSummary.total_count === 0
			? taskSummary
			: fallbackTaskSummary;

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
			".rfNodeNoteEditorRibbonFloating",
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
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			documentSessionRef.current += 1;
			if (taskSummaryTimerRef.current !== null) {
				window.clearTimeout(taskSummaryTimerRef.current);
				taskSummaryTimerRef.current = null;
			}
		};
	}, []);

	const isCurrentSession = useCallback((sessionId: number) => {
		return mountedRef.current && documentSessionRef.current === sessionId;
	}, []);

	useEffect(() => {
		const sessionId = documentSessionRef.current + 1;
		documentSessionRef.current = sessionId;
		saveRequestTokenRef.current += 1;
		const cached = initialDoc?.text ?? getCachedMarkdownDoc(relPath) ?? "";
		textRef.current = cached;
		savedTextRef.current = cached;
		mtimeRef.current = initialDoc?.mtime_ms ?? null;
		autosaveInFlightRef.current = false;
		autosaveQueuedRef.current = false;
		if (externalSyncTimerRef.current !== null) {
			window.clearTimeout(externalSyncTimerRef.current);
			externalSyncTimerRef.current = null;
		}
		pendingExternalReloadRef.current = false;
		setText(cached);
		setSavedText(cached);
		setLastSavedMtimeMs(initialDoc?.mtime_ms ?? null);
		setSaving(false);
		setAutosaveBusy(false);
		setSyncPulse(null);
		setTaskSummary(EMPTY_TASK_SUMMARY);
		hasUserEditsRef.current = false;
		setError(initialError);
		setActionsOpen(false);
		if (initialDoc) {
			setPrefetchedNote(relPath, initialDoc);
		}
	}, [initialDoc, initialError, relPath]);

	useEffect(() => {
		if (previousSpacePathRef.current === spacePath) return;
		previousSpacePathRef.current = spacePath;
		documentSessionRef.current += 1;
		saveRequestTokenRef.current += 1;
		if (externalSyncTimerRef.current !== null) {
			window.clearTimeout(externalSyncTimerRef.current);
			externalSyncTimerRef.current = null;
		}
		pendingExternalReloadRef.current = false;
		textRef.current = "";
		savedTextRef.current = "";
		mtimeRef.current = null;
		autosaveInFlightRef.current = false;
		autosaveQueuedRef.current = false;
		hasUserEditsRef.current = false;
		setText("");
		setSavedText("");
		setLastSavedMtimeMs(null);
		setSaving(false);
		setAutosaveBusy(false);
		setSyncPulse(null);
		setTaskSummary(EMPTY_TASK_SUMMARY);
		clearMarkdownDocCache();
		if (spacePath === null) {
			return;
		}
	}, [spacePath]);

	const loadDoc = useCallback(
		async (showRefreshFeedback = false) => {
			const sessionId = documentSessionRef.current;
			setError("");
			try {
				const doc = await invoke("space_read_text", { path: relPath });
				if (!isCurrentSession(sessionId)) return;
				const shouldReplaceText = textRef.current === savedTextRef.current;
				setPrefetchedNote(relPath, doc);
				if (shouldReplaceText) {
					textRef.current = doc.text;
					setText(doc.text);
				}
				savedTextRef.current = doc.text;
				mtimeRef.current = doc.mtime_ms;
				setSavedText(doc.text);
				setLastSavedMtimeMs(doc.mtime_ms);
				hasUserEditsRef.current = false;
				setPrefetchedNote(relPath, doc);
				if (showRefreshFeedback) {
					flashSyncPulse("reloaded");
				}
			} catch (e) {
				if (!isCurrentSession(sessionId)) return;
				setError(extractErrorMessage(e));
			}
		},
		[flashSyncPulse, isCurrentSession, relPath],
	);

	const loadDocFromExternalChange = useCallback(async () => {
		const sessionId = documentSessionRef.current;
		setError("");
		try {
			const doc = await invoke("space_read_text", { path: relPath });
			if (!isCurrentSession(sessionId)) return;
			if (
				doc.mtime_ms === mtimeRef.current &&
				doc.text === savedTextRef.current
			)
				return;
			setPrefetchedNote(relPath, doc);
			textRef.current = doc.text;
			savedTextRef.current = doc.text;
			mtimeRef.current = doc.mtime_ms;
			setText(doc.text);
			setSavedText(doc.text);
			setLastSavedMtimeMs(doc.mtime_ms);
			hasUserEditsRef.current = false;
		} catch (e) {
			if (!isCurrentSession(sessionId)) return;
			setError(extractErrorMessage(e));
		}
	}, [isCurrentSession, relPath]);

	useEffect(() => {
		if (initialDoc) return;
		void loadDoc();
	}, [initialDoc, loadDoc]);

	const persistDoc = useCallback(
		async (
			path: string,
			nextText: string,
			sessionId = documentSessionRef.current,
		): Promise<boolean> => {
			const applySaveState = (saved: string, mtimeMs: number) => {
				if (path !== relPath || !isCurrentSession(sessionId)) return;
				setPrefetchedNote(path, {
					rel_path: path,
					text: saved,
					etag: "",
					mtime_ms: mtimeMs,
				});
				savedTextRef.current = saved;
				mtimeRef.current = mtimeMs;
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
				if (!isCurrentSession(sessionId)) return false;
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
					if (!isCurrentSession(sessionId)) return false;
					if (latest.text === nextText) {
						applySaveState(nextText, latest.mtime_ms);
						return true;
					}
					savedTextRef.current = latest.text;
					mtimeRef.current = latest.mtime_ms;
					const retry = await invoke("space_write_text", {
						path,
						text: nextText,
						base_mtime_ms: latest.mtime_ms,
					});
					applySaveState(nextText, retry.mtime_ms);
					return true;
				} catch (retryError) {
					if (!isCurrentSession(sessionId)) return false;
					setError(extractErrorMessage(retryError));
					return false;
				}
			}
		},
		[flashSyncPulse, isCurrentSession, relPath],
	);

	const onSave = useCallback(async () => {
		const sessionId = documentSessionRef.current;
		const saveToken = saveRequestTokenRef.current + 1;
		saveRequestTokenRef.current = saveToken;
		setSaving(true);
		try {
			await persistDoc(relPath, textRef.current, sessionId);
		} finally {
			if (
				saveRequestTokenRef.current === saveToken &&
				isCurrentSession(sessionId)
			) {
				setSaving(false);
			}
		}
	}, [isCurrentSession, persistDoc, relPath]);

	const runAutosave = useCallback(async () => {
		const sessionId = documentSessionRef.current;
		if (autosaveInFlightRef.current) {
			autosaveQueuedRef.current = true;
			return false;
		}

		const path = relPath;
		const snapshot = textRef.current;
		if (snapshot === savedTextRef.current) return false;

		autosaveInFlightRef.current = true;
		setAutosaveBusy(true);
		const ok = await persistDoc(path, snapshot, sessionId);
		if (!isCurrentSession(sessionId)) return ok;
		autosaveInFlightRef.current = false;
		setAutosaveBusy(false);
		if (autosaveQueuedRef.current) {
			autosaveQueuedRef.current = false;
			return runAutosave();
		}
		if (ok && textRef.current !== savedTextRef.current) {
			return runAutosave();
		}
		return ok;
	}, [isCurrentSession, persistDoc, relPath]);

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
		const handleForceEditMode = (event: Event) => {
			const detail = (event as CustomEvent<ForceNoteEditModeDetail>).detail;
			if (!detail?.path || detail.path !== relPath) return;
			setMode("rich");
		};
		window.addEventListener(FORCE_NOTE_EDIT_MODE_EVENT, handleForceEditMode);
		return () => {
			window.removeEventListener(
				FORCE_NOTE_EDIT_MODE_EVENT,
				handleForceEditMode,
			);
		};
	}, [relPath]);

	const captureZenViewportAnchor = useCallback(() => {
		const scrollEl = contentScrollRef.current;
		const pane = paneRef.current;
		if (!scrollEl || !pane) return;

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return;
		const range = selection.getRangeAt(0);
		if (!pane.contains(range.commonAncestorContainer)) return;

		const rect =
			range.getClientRects()[0] ??
			(range.startContainer instanceof Element
				? range.startContainer.getBoundingClientRect()
				: (range.startContainer.parentElement?.getBoundingClientRect() ??
					null));
		if (!rect) return;

		const viewportTop = rect.top - scrollEl.getBoundingClientRect().top;
		pendingZenViewportAnchorRef.current = {
			topWithinViewport: viewportTop,
			scrollTop: scrollEl.scrollTop,
		};
	}, []);

	useEffect(() => {
		const handleZenWillToggle = (event: Event) => {
			const detail = (event as CustomEvent<ZenModeWillToggleDetail>).detail;
			if (!detail?.path || detail.path !== relPath) return;
			captureZenViewportAnchor();
		};
		window.addEventListener(ZEN_MODE_WILL_TOGGLE_EVENT, handleZenWillToggle);
		return () => {
			window.removeEventListener(
				ZEN_MODE_WILL_TOGGLE_EVENT,
				handleZenWillToggle,
			);
		};
	}, [captureZenViewportAnchor, relPath]);

	useLayoutEffect(() => {
		const anchor = pendingZenViewportAnchorRef.current;
		const scrollEl = contentScrollRef.current;
		const pane = paneRef.current;
		if (!anchor || !scrollEl || !pane) return;

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			pendingZenViewportAnchorRef.current = null;
			return;
		}
		const range = selection.getRangeAt(0);
		if (!pane.contains(range.commonAncestorContainer)) {
			pendingZenViewportAnchorRef.current = null;
			return;
		}

		const rect =
			range.getClientRects()[0] ??
			(range.startContainer instanceof Element
				? range.startContainer.getBoundingClientRect()
				: (range.startContainer.parentElement?.getBoundingClientRect() ??
					null));
		if (!rect) {
			pendingZenViewportAnchorRef.current = null;
			return;
		}

		const nextTopWithinViewport =
			rect.top - scrollEl.getBoundingClientRect().top;
		const delta = nextTopWithinViewport - anchor.topWithinViewport;
		if (Math.abs(delta) > 0.5) {
			scrollEl.scrollTop = anchor.scrollTop + delta;
		}
		pendingZenViewportAnchorRef.current = null;
	});

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
			if (taskSummaryTimerRef.current !== null) {
				window.clearTimeout(taskSummaryTimerRef.current);
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
		if (taskSummaryTimerRef.current !== null) {
			window.clearTimeout(taskSummaryTimerRef.current);
			taskSummaryTimerRef.current = null;
		}
		setTaskSummary(EMPTY_TASK_SUMMARY);

		const requestToken = taskSummaryRequestTokenRef.current + 1;
		taskSummaryRequestTokenRef.current = requestToken;

		taskSummaryTimerRef.current = window.setTimeout(() => {
			taskSummaryTimerRef.current = null;
			void invoke("task_summary", { markdown: textRef.current })
				.then((summary) => {
					if (
						!mountedRef.current ||
						taskSummaryRequestTokenRef.current !== requestToken
					) {
						return;
					}
					const fallback = summarizeTasksFromMarkdown(textRef.current);
					setTaskSummary(
						summary.total_count > 0 || fallback.total_count === 0
							? summary
							: fallback,
					);
				})
				.catch(() => {
					if (
						!mountedRef.current ||
						taskSummaryRequestTokenRef.current !== requestToken
					) {
						return;
					}
					setTaskSummary(summarizeTasksFromMarkdown(textRef.current));
				});
		}, 90);

		return () => {
			if (taskSummaryTimerRef.current !== null) {
				window.clearTimeout(taskSummaryTimerRef.current);
				taskSummaryTimerRef.current = null;
			}
		};
	}, [text]);

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
		const observedTargets = new Set<Element>();
		const observeIfPresent = (element: Element | null) => {
			if (!element || observedTargets.has(element)) return;
			resizeObserver.observe(element);
			observedTargets.add(element);
		};
		resizeObserver.observe(pane);
		observedTargets.add(pane);
		const editorRoot = pane.querySelector(
			".rfNodeNoteEditor",
		) as HTMLElement | null;
		const floatingRibbon = pane.querySelector(
			".rfNodeNoteEditorRibbonFloating",
		) as HTMLElement | null;
		observeIfPresent(editorRoot);
		observeIfPresent(floatingRibbon);

		const mutationObserver = new MutationObserver(() => {
			observeIfPresent(
				pane.querySelector(".rfNodeNoteEditor") as HTMLElement | null,
			);
			observeIfPresent(
				pane.querySelector(
					".rfNodeNoteEditorRibbonFloating",
				) as HTMLElement | null,
			);
			schedule();
		});
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
	const registerCalloutInserter = useCallback(
		(inserter: ((type: string) => void) | null) => {
			calloutInserterRef.current = inserter;
		},
		[],
	);

	return (
		<section
			className={
				zenModeActive
					? "filePreviewPane markdownEditorPane markdownEditorPaneZen"
					: "filePreviewPane markdownEditorPane"
			}
			ref={paneRef}
		>
			<div
				className={[
					"markdownEditorFloatActions",
					zenModeActive ? "is-zen-hidden" : "",
				]
					.filter(Boolean)
					.join(" ")}
				aria-hidden={zenModeActive}
			>
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
						<HugeiconsIcon icon={MenuCircleIcon} size={14} strokeWidth={0.9} />
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
									<HugeiconsIcon
										icon={SourceCodeIcon}
										size={12}
										strokeWidth={0.9}
									/>
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
						zenModeActive ? "is-zen-hidden" : "",
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
							<HugeiconsIcon
								icon={TimeQuarter02Icon}
								size={13}
								strokeWidth={0.9}
								aria-hidden
							/>
							<span>{stats.readingTime}</span>
						</div>
						{visibleTaskSummary.total_count > 0 ? (
							<div
								className="markdownEditorStatsItem markdownEditorTaskProgressItem"
								data-metric="task-progress"
							>
								<TaskProgressIndicator summary={visibleTaskSummary} />
							</div>
						) : null}
						<div
							className="markdownEditorStatsItem markdownEditorSaveState"
							data-metric="save-state"
							data-save-state={saveSignal.state}
							title={saveSignal.description}
							aria-label={`Save status: ${saveSignal.label}`}
						>
							<Save size={13} aria-hidden />
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
				<div
					ref={contentScrollRef}
					className="filePreviewTextWrap markdownEditorContent"
				>
					<div className="markdownEditorCenter">
						<CanvasNoteInlineEditor
							markdown={text}
							relPath={relPath}
							mode={mode}
							zenModeActive={zenModeActive}
							pasteMarkdownBehavior="smart-markdown"
							onModeChange={setMode}
							onChange={(nextText) => {
								hasUserEditsRef.current = true;
								textRef.current = nextText;
								setText(nextText);
							}}
							onRegisterCalloutInserter={registerCalloutInserter}
							onEditorReady={setTocEditor}
						/>
					</div>
				</div>
			) : null}

			{showToc && !zenModeActive && mode === "rich" && !error && tocEditor ? (
				<FloatingTOC editor={tocEditor} />
			) : null}
		</section>
	);
}
