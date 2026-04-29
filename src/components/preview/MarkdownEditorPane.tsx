import {
	AiEditingIcon,
	BadgeInfoIcon,
	FlowConnectionIcon,
	SlidersHorizontalIcon,
	SourceCodeIcon,
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
import { useMarkdownTaskSummary } from "../../hooks/useMarkdownTaskSummary";
import { useTaskProgressIndicatorSetting } from "../../hooks/useTaskProgressIndicatorSetting";
import {
	FORCE_NOTE_EDIT_MODE_EVENT,
	type ForceNoteEditModeDetail,
	OPEN_LOCAL_GRAPH_EVENT,
	type OpenLocalGraphDetail,
	TOGGLE_NOTE_INFO_SIDEBAR_EVENT,
	type ToggleNoteInfoSidebarDetail,
	ZEN_MODE_WILL_TOGGLE_EVENT,
	type ZenModeWillToggleDetail,
} from "../../lib/appEvents";
import { extractErrorMessage } from "../../lib/errorUtils";
import { setPrefetchedNote } from "../../lib/navigationPrefetch";
import {
	joinYamlFrontmatter,
	splitYamlFrontmatter,
} from "../../lib/notePreview";
import {
	type BacklinkItem,
	type TextFileDoc,
	type WorkspaceDatabasePreviewContext,
	invoke,
} from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { countWords, formatReadingTime } from "../../lib/textStats";
import { normalizeRelPath } from "../../utils/path";
import { Edit, Eye, RefreshCw, Save } from "../Icons";
import { FloatingTOC } from "../editor/FloatingTOC";
import { NoteInlineEditor } from "../editor/NoteInlineEditor";
import { useTableOfContents } from "../editor/hooks/useTableOfContents";
import { parseWikiLink } from "../editor/markdown/wikiLinkCodec";
import type { NoteInlineEditorMode } from "../editor/types";
import { LocalNoteGraphDialog } from "../graph/LocalNoteGraphDialog";
import { Button } from "../ui/shadcn/button";
import { NotesInfoSidebar } from "./NotesInfoSidebar";
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

type SyncPulse = "saved" | "reloaded" | null;
type LinkedNoteKind = "wiki" | "markdown";

interface LinkedNoteItem {
	id: string;
	label: string;
	kind: LinkedNoteKind;
}

interface SidebarBacklinkItem {
	id: string;
	label: string;
}

const UTF8_ENCODER = new TextEncoder();

function countLines(markdown: string): number {
	if (markdown.length === 0) return 0;
	let lines = 1;
	for (let i = 0; i < markdown.length; i += 1) {
		if (markdown.charCodeAt(i) === 10) {
			lines += 1;
		}
	}
	return lines;
}

function noteLabelFromPath(path: string): string {
	const segments = path.split("/").filter(Boolean);
	const tail = segments[segments.length - 1] ?? path;
	return tail.endsWith(".md") ? tail.slice(0, -3) : tail;
}

function extractLinkedNotes(markdown: string): LinkedNoteItem[] {
	const out = new Map<string, LinkedNoteItem>();

	for (const match of markdown.matchAll(/!?\[\[[^\]\n]+\]\]/g)) {
		const raw = match[0];
		const parsed = parseWikiLink(raw);
		if (!parsed?.target) continue;
		const target = parsed.target.trim();
		if (!target) continue;
		const existing = out.get(target);
		const nextLabel = parsed.alias?.trim() || parsed.target;
		if (!existing || existing.label === existing.id) {
			out.set(target, {
				id: target,
				label: nextLabel,
				kind: "wiki",
			});
		}
	}

	for (const match of markdown.matchAll(/\[[^\]\n]+\]\((?:\\.|[^)\n])+\)/g)) {
		const raw = match[0];
		const linkMatch = raw.match(
			/^\[([^\]\n]+)\]\(([^)\n]*?)(?:\s+"[^"\n]*")?\)$/,
		);
		const linkText = linkMatch?.[1]?.trim() ?? "";
		const hrefMatch = raw.match(
			/^\[[^\]\n]+\]\(([^)\n]*?)(?:\s+"[^"\n]*")?\)$/,
		);
		const href = hrefMatch?.[1]?.trim() ?? "";
		if (!href) continue;
		if (
			href.startsWith("#") ||
			href.startsWith("http://") ||
			href.startsWith("https://") ||
			href.startsWith("mailto:") ||
			href.startsWith("tel:")
		) {
			continue;
		}
		const withoutFragment = href.split("#")[0]?.split("?")[0]?.trim() ?? "";
		if (!withoutFragment) continue;
		const existing = out.get(withoutFragment);
		const nextLabel = linkText || noteLabelFromPath(withoutFragment);
		if (!existing || existing.label === existing.id) {
			out.set(withoutFragment, {
				id: withoutFragment,
				label: nextLabel,
				kind: "markdown",
			});
		}
	}

	return Array.from(out.values());
}

export function MarkdownEditorPane({
	relPath,
	onDirtyChange,
	initialDoc = null,
	initialError = "",
}: MarkdownEditorPaneProps) {
	const initialText = initialDoc?.text ?? peekCachedMarkdownDoc(relPath) ?? "";
	const [text, setText] = useState(() => initialText);
	const [savedText, setSavedText] = useState(() => initialText);
	const [mode, setMode] = useState<NoteInlineEditorMode>("rich");
	const [saving, setSaving] = useState(false);
	const [autosaveBusy, setAutosaveBusy] = useState(false);
	const [error, setError] = useState(() => initialError || "");
	const [actionsOpen, setActionsOpen] = useState(false);
	const [infoPanelOpen, setInfoPanelOpen] = useState(false);
	const [localGraphOpen, setLocalGraphOpen] = useState(false);
	const [lastSavedMtimeMs, setLastSavedMtimeMs] = useState<number | null>(
		initialDoc?.mtime_ms ?? null,
	);
	const [syncPulse, setSyncPulse] = useState<SyncPulse>(null);
	const [linkedMentions, setLinkedMentions] = useState<BacklinkItem[]>([]);
	const showTaskProgressIndicator = useTaskProgressIndicatorSetting(null);
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
	const pendingExternalReloadRef = useRef(false);
	const activeRelPathRef = useRef(relPath);
	const paneRef = useRef<HTMLElement | null>(null);
	const contentScrollRef = useRef<HTMLDivElement | null>(null);
	const { spacePath } = useSpace();
	const previousSpacePathRef = useRef<string | null>(spacePath);
	const pendingZenViewportAnchorRef = useRef<{
		topWithinViewport: number;
		scrollTop: number;
	} | null>(null);
	const [tocEditor, setTocEditor] = useState<Editor | null>(null);
	const {
		headings: tocHeadings,
		activeId: tocActiveId,
		scrollToHeading,
	} = useTableOfContents(tocEditor);
	const [previewContext, setPreviewContext] =
		useState<WorkspaceDatabasePreviewContext | null>(null);
	const { zenModeActive, openSettings, showToc } = useUILayoutContext();
	const { aiEnabled, aiPanelOpen, setAiPanelOpen } = useAISidebarContext();
	const shouldReduceMotion = useReducedMotion();

	const isDirty = text !== savedText;
	const { frontmatter: currentFrontmatter, body: currentBody } = useMemo(
		() => splitYamlFrontmatter(text),
		[text],
	);
	const stats = useMemo(() => {
		const words = countWords(currentBody);
		const characters = currentBody.length;
		return {
			words,
			characters,
			readingTime: formatReadingTime(words),
		};
	}, [currentBody]);
	const visibleTaskSummary = useMarkdownTaskSummary(
		text,
		showTaskProgressIndicator === true,
	);
	const utf8SizeBytes = useMemo(() => {
		if (!infoPanelOpen) return 0;
		return UTF8_ENCODER.encode(text).length;
	}, [infoPanelOpen, text]);
	const lineCount = useMemo(() => {
		if (!infoPanelOpen) return 0;
		return countLines(text);
	}, [infoPanelOpen, text]);
	const linkedNotes = useMemo(() => {
		const current = normalizeRelPath(relPath);
		return extractLinkedNotes(text).filter((item) => {
			const normalized = normalizeRelPath(item.id);
			if (!normalized) return false;
			return normalized !== current;
		});
	}, [relPath, text]);
	const sidebarBacklinks = useMemo(() => {
		const merged = new Map<string, SidebarBacklinkItem>();

		for (const item of linkedMentions) {
			const id = item.id.trim();
			if (!id) continue;
			merged.set(id, {
				id,
				label: item.title?.trim() || noteLabelFromPath(id),
			});
		}

		for (const path of previewContext?.backlinks ?? []) {
			const id = path.trim();
			if (!id || merged.has(id)) continue;
			merged.set(id, {
				id,
				label: noteLabelFromPath(id),
			});
		}

		return Array.from(merged.values());
	}, [linkedMentions, previewContext?.backlinks]);

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

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			documentSessionRef.current += 1;
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
		hasUserEditsRef.current = false;
		setError(initialError);
		setActionsOpen(false);
		if (activeRelPathRef.current !== relPath) {
			setInfoPanelOpen(false);
		}
		activeRelPathRef.current = relPath;
		setLocalGraphOpen(false);
		setPreviewContext(null);
		setLinkedMentions([]);
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
		const handleOpenLocalGraph = (event: Event) => {
			const detail = (event as CustomEvent<OpenLocalGraphDetail>).detail;
			if (!detail?.path || detail.path !== relPath) return;
			setLocalGraphOpen(true);
		};
		const handleToggleInfoSidebar = (event: Event) => {
			const detail = (event as CustomEvent<ToggleNoteInfoSidebarDetail>).detail;
			if (!detail?.path || detail.path !== relPath) return;
			setInfoPanelOpen((open) => !open);
		};
		window.addEventListener(FORCE_NOTE_EDIT_MODE_EVENT, handleForceEditMode);
		window.addEventListener(OPEN_LOCAL_GRAPH_EVENT, handleOpenLocalGraph);
		window.addEventListener(
			TOGGLE_NOTE_INFO_SIDEBAR_EVENT,
			handleToggleInfoSidebar,
		);
		return () => {
			window.removeEventListener(
				FORCE_NOTE_EDIT_MODE_EVENT,
				handleForceEditMode,
			);
			window.removeEventListener(OPEN_LOCAL_GRAPH_EVENT, handleOpenLocalGraph);
			window.removeEventListener(
				TOGGLE_NOTE_INFO_SIDEBAR_EVENT,
				handleToggleInfoSidebar,
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
		if (!infoPanelOpen) return;
		let cancelled = false;
		void (async () => {
			try {
				const context = await invoke("databases_preview_context", {
					note_path: relPath,
					space_path: spacePath,
				});
				if (cancelled) return;
				setPreviewContext(context);
			} catch {
				if (cancelled) return;
				setPreviewContext(null);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [infoPanelOpen, relPath, spacePath]);

	useEffect(() => {
		if (!infoPanelOpen) return;
		let cancelled = false;
		void invoke("backlinks", { note_id: relPath, space_path: spacePath })
			.then((items) => {
				if (cancelled) return;
				setLinkedMentions(items);
			})
			.catch(() => {
				if (cancelled) return;
				setLinkedMentions([]);
			});
		return () => {
			cancelled = true;
		};
	}, [infoPanelOpen, relPath, spacePath]);

	const handleInfoFrontmatterChange = useCallback(
		(nextFrontmatter: string | null) => {
			const normalizedFrontmatter = nextFrontmatter?.trim().length
				? nextFrontmatter
				: null;
			const nextMarkdown = joinYamlFrontmatter(
				normalizedFrontmatter,
				currentBody,
			);
			if (nextMarkdown === textRef.current) return;
			hasUserEditsRef.current = true;
			textRef.current = nextMarkdown;
			setText(nextMarkdown);
			// Property edits are discrete commits — save immediately so the
			// indexer picks up the change and databases/backlinks update.
			void runAutosave();
		},
		[currentBody, runAutosave],
	);

	return (
		<section
			className={[
				"filePreviewPane",
				"markdownEditorPane",
				zenModeActive ? "markdownEditorPaneZen" : "",
			]
				.filter(Boolean)
				.join(" ")}
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
				<div className="markdownEditorTopActions">
					<button
						type="button"
						className="markdownEditorMenuTrigger markdownEditorAiTrigger"
						onClick={() => {
							if (!aiEnabled) {
								openSettings("ai");
								return;
							}
							setAiPanelOpen((open) => !open);
						}}
						aria-label={
							aiEnabled
								? aiPanelOpen
									? "Close AI panel"
									: "Open AI panel"
								: "Open AI settings"
						}
						title={
							aiEnabled
								? aiPanelOpen
									? "Close AI panel"
									: "Open AI panel"
								: "Open AI settings"
						}
						aria-pressed={aiEnabled ? aiPanelOpen : undefined}
					>
						<HugeiconsIcon icon={AiEditingIcon} size={15} strokeWidth={0.9} />
					</button>
					<div className="markdownEditorActionsMenu">
						<button
							type="button"
							className="markdownEditorMenuTrigger"
							data-open={actionsOpen ? "true" : "false"}
							onClick={() => setActionsOpen((prev) => !prev)}
							aria-label={
								actionsOpen ? "Close editor actions" : "Open editor actions"
							}
							title={
								actionsOpen ? "Close editor actions" : "Open editor actions"
							}
							aria-expanded={actionsOpen}
						>
							<HugeiconsIcon
								icon={SlidersHorizontalIcon}
								size={15}
								strokeWidth={0.9}
							/>
						</button>
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
										data-active={infoPanelOpen}
										onClick={() => {
											setInfoPanelOpen((open) => !open);
											setActionsOpen(false);
										}}
									>
										<HugeiconsIcon
											icon={BadgeInfoIcon}
											size={12}
											strokeWidth={0.9}
										/>
										Info
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="xs"
										className="markdownEditorActionItem"
										onClick={() => {
											setLocalGraphOpen(true);
											setActionsOpen(false);
										}}
									>
										<HugeiconsIcon
											icon={FlowConnectionIcon}
											size={12}
											strokeWidth={0.9}
										/>
										Local graph
									</Button>
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
			</div>
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
						<NoteInlineEditor
							markdown={text}
							relPath={relPath}
							mode={mode}
							zenModeActive={zenModeActive}
							pasteMarkdownBehavior="smart-markdown"
							onChange={(nextText) => {
								hasUserEditsRef.current = true;
								textRef.current = nextText;
								setText(nextText);
							}}
							onFrontmatterCommit={runAutosave}
							onEditorReady={setTocEditor}
						/>
					</div>
				</div>
			) : null}
			{showToc && !infoPanelOpen && !error && mode !== "plain" ? (
				<FloatingTOC editor={tocEditor} />
			) : null}

			<NotesInfoSidebar
				open={infoPanelOpen}
				mode={mode}
				zenModeActive={zenModeActive}
				hasError={Boolean(error)}
				relPath={relPath}
				frontmatter={currentFrontmatter}
				onFrontmatterChange={handleInfoFrontmatterChange}
				stats={stats}
				taskSummary={visibleTaskSummary}
				tocHeadings={tocHeadings}
				tocActiveId={tocActiveId}
				onSelectHeading={scrollToHeading}
				backlinks={sidebarBacklinks}
				linkedNotes={linkedNotes}
				previewContext={previewContext}
				lastSavedMtimeMs={lastSavedMtimeMs}
				lineCount={lineCount}
				utf8SizeBytes={utf8SizeBytes}
				saveLabel={saveSignal.label}
				onClose={() => setInfoPanelOpen(false)}
			/>

			<LocalNoteGraphDialog
				open={localGraphOpen}
				onOpenChange={setLocalGraphOpen}
				noteId={relPath}
				graphRefreshKey={lastSavedMtimeMs ?? 0}
			/>
		</section>
	);
}
