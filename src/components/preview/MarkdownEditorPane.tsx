import {
	AiBrain04Icon,
	LayoutAlignRightIcon,
	SlidersHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Editor } from "@tiptap/react";
import {
	type MouseEvent as ReactMouseEvent,
	useCallback,
	useEffect,
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
import {
	OPEN_LOCAL_CONNECTIONS_EVENT,
	type OpenLocalConnectionsDetail,
	TOGGLE_NOTE_INFO_SIDEBAR_EVENT,
	type ToggleNoteInfoSidebarDetail,
} from "../../lib/appEvents";
import { extractErrorMessage } from "../../lib/errorUtils";
import { showNativePopupMenu } from "../../lib/nativeContextMenu";
import { setPrefetchedNote } from "../../lib/navigationPrefetch";
import {
	joinYamlFrontmatter,
	splitYamlFrontmatter,
} from "../../lib/notePreview";
import { groupRelationshipsByField } from "../../lib/relationships";
import {
	type BacklinkItem,
	type NoteRelationship,
	type TextFileDoc,
	type WorkspaceDatabasePreviewContext,
	invoke,
} from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { countWords, formatReadingTime } from "../../lib/textStats";
import { normalizeRelPath } from "../../utils/path";
import { LocalNoteConnectionsDialog } from "../connections/LocalNoteConnectionsDialog";
import { FloatingTOC } from "../editor/FloatingTOC";
import { NoteInlineEditor } from "../editor/NoteInlineEditor";
import { useTableOfContents } from "../editor/hooks/useTableOfContents";
import { parseWikiLink } from "../editor/markdown/wikiLinkCodec";
import type {
	ExtractToNoteActions,
	NoteInlineEditorMode,
} from "../editor/types";
import { LinkedNotePreviewSheet } from "./LinkedNotePreviewSheet";
import { NotesInfoSidebar } from "./NotesInfoSidebar";
import {
	clearMarkdownDocCache,
	getCachedMarkdownDoc,
	peekCachedMarkdownDoc,
} from "./markdownCache";

interface MarkdownEditorPaneProps {
	relPath: string;
	onDirtyChange?: (dirty: boolean) => void;
	onInfoSidebarOpenChange?: (open: boolean) => void;
	initialDoc?: TextFileDoc | null;
	initialError?: string;
	extractToNoteActions?: ExtractToNoteActions;
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
const INFO_PANEL_DERIVATION_DEBOUNCE_MS = 700;

const EMPTY_STATS = {
	words: 0,
	characters: 0,
	readingTime: "0s",
};

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

function noteLinkLabel(label: string | null | undefined, fallbackPath: string) {
	return label?.trim() || noteLabelFromPath(fallbackPath);
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
		const nextLabel = noteLinkLabel(parsed.alias, target);
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
		const nextLabel = noteLinkLabel(linkText, withoutFragment);
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
	onInfoSidebarOpenChange,
	initialDoc = null,
	initialError = "",
	extractToNoteActions,
}: MarkdownEditorPaneProps) {
	const initialText = initialDoc?.text ?? peekCachedMarkdownDoc(relPath) ?? "";
	const [text, setText] = useState(() => initialText);
	const [infoPanelText, setInfoPanelText] = useState(() => initialText);
	const [savedText, setSavedText] = useState(() => initialText);
	const [mode, setMode] = useState<NoteInlineEditorMode>("rich");
	const [saving, setSaving] = useState(false);
	const [autosaveBusy, setAutosaveBusy] = useState(false);
	const [error, setError] = useState(() => initialError || "");
	const [infoPanelOpen, setInfoPanelOpen] = useState(false);
	const [localConnectionsOpen, setLocalConnectionsOpen] = useState(false);
	const [lastSavedMtimeMs, setLastSavedMtimeMs] = useState<number | null>(
		initialDoc?.mtime_ms ?? null,
	);
	const [syncPulse, setSyncPulse] = useState<SyncPulse>(null);
	const [linkedMentions, setLinkedMentions] = useState<BacklinkItem[]>([]);
	const [relationships, setRelationships] = useState<NoteRelationship[]>([]);

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
	const [tocEditor, setTocEditor] = useState<Editor | null>(null);
	const {
		headings: tocHeadings,
		activeId: tocActiveId,
		scrollToHeading,
	} = useTableOfContents(tocEditor);
	const [previewContext, setPreviewContext] =
		useState<WorkspaceDatabasePreviewContext | null>(null);
	const { openSettings, showToc } = useUILayoutContext();
	const { aiEnabled, aiPanelOpen, setAiPanelOpen } = useAISidebarContext();

	const isDirty = text !== savedText;
	const { frontmatter: currentFrontmatter, body: currentBody } = useMemo(
		() =>
			infoPanelOpen
				? splitYamlFrontmatter(infoPanelText)
				: { frontmatter: null, body: "" },
		[infoPanelOpen, infoPanelText],
	);
	const stats = useMemo(() => {
		if (!infoPanelOpen) return EMPTY_STATS;
		const words = countWords(currentBody);
		const characters = currentBody.length;
		return {
			words,
			characters,
			readingTime: formatReadingTime(words),
		};
	}, [currentBody, infoPanelOpen]);
	const visibleTaskSummary = useMarkdownTaskSummary(
		infoPanelText,
		infoPanelOpen,
	);
	const utf8SizeBytes = useMemo(() => {
		if (!infoPanelOpen) return 0;
		return UTF8_ENCODER.encode(infoPanelText).length;
	}, [infoPanelOpen, infoPanelText]);
	const lineCount = useMemo(() => {
		if (!infoPanelOpen) return 0;
		return countLines(infoPanelText);
	}, [infoPanelOpen, infoPanelText]);
	const linkedNotes = useMemo(() => {
		if (!infoPanelOpen) return [];
		const current = normalizeRelPath(relPath);
		return extractLinkedNotes(infoPanelText).filter((item) => {
			const normalized = normalizeRelPath(item.id);
			if (!normalized) return false;
			return normalized !== current;
		});
	}, [infoPanelOpen, relPath, infoPanelText]);
	const sidebarBacklinks = useMemo(() => {
		const merged = new Map<string, SidebarBacklinkItem>();

		for (const item of linkedMentions) {
			const id = item.id.trim();
			if (!id) continue;
			merged.set(id, {
				id,
				label: noteLinkLabel(item.title, id),
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
	const relationshipGroups = useMemo(
		() => groupRelationshipsByField(relationships),
		[relationships],
	);

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

	const saveLabel = useMemo(() => {
		if (saving || autosaveBusy) {
			return "Saving";
		}
		if (isDirty) {
			return "Edited";
		}
		if (syncPulse === "reloaded") {
			return "Fresh";
		}
		if (syncPulse === "saved") {
			return "Saved";
		}
		return lastSavedMtimeMs ? "Saved" : "Ready";
	}, [autosaveBusy, isDirty, lastSavedMtimeMs, saving, syncPulse]);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			documentSessionRef.current += 1;
		};
	}, []);

	useEffect(() => {
		if (!infoPanelOpen) return;
		setInfoPanelText(textRef.current);
	}, [infoPanelOpen]);

	useEffect(() => {
		if (!infoPanelOpen) return;
		const timer = window.setTimeout(() => {
			setInfoPanelText(text);
		}, INFO_PANEL_DERIVATION_DEBOUNCE_MS);
		return () => window.clearTimeout(timer);
	}, [infoPanelOpen, text]);

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
		setInfoPanelText(cached);
		setSavedText(cached);
		setLastSavedMtimeMs(initialDoc?.mtime_ms ?? null);
		setSaving(false);
		setAutosaveBusy(false);
		setSyncPulse(null);
		hasUserEditsRef.current = false;
		setError(initialError);
		if (activeRelPathRef.current !== relPath) {
			setInfoPanelOpen(false);
		}
		activeRelPathRef.current = relPath;
		setLocalConnectionsOpen(false);
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
		setInfoPanelText("");
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
					setInfoPanelText(doc.text);
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
			setInfoPanelText(doc.text);
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
		const handleOpenLocalConnections = (event: Event) => {
			const detail = (event as CustomEvent<OpenLocalConnectionsDetail>).detail;
			if (!detail?.path || detail.path !== relPath) return;
			setLocalConnectionsOpen(true);
		};
		const handleToggleInfoSidebar = (event: Event) => {
			const detail = (event as CustomEvent<ToggleNoteInfoSidebarDetail>).detail;
			if (!detail?.path || detail.path !== relPath) return;
			setAiPanelOpen(() => false);
			setInfoPanelOpen((open) => {
				const nextOpen = !open;
				if (nextOpen) setInfoPanelText(textRef.current);
				return nextOpen;
			});
		};
		window.addEventListener(
			OPEN_LOCAL_CONNECTIONS_EVENT,
			handleOpenLocalConnections,
		);
		window.addEventListener(
			TOGGLE_NOTE_INFO_SIDEBAR_EVENT,
			handleToggleInfoSidebar,
		);
		return () => {
			window.removeEventListener(
				OPEN_LOCAL_CONNECTIONS_EVENT,
				handleOpenLocalConnections,
			);
			window.removeEventListener(
				TOGGLE_NOTE_INFO_SIDEBAR_EVENT,
				handleToggleInfoSidebar,
			);
		};
	}, [relPath, setAiPanelOpen]);

	useEffect(() => {
		if (aiPanelOpen) setInfoPanelOpen(false);
	}, [aiPanelOpen]);

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
		onInfoSidebarOpenChange?.(infoPanelOpen);
	}, [infoPanelOpen, onInfoSidebarOpenChange]);

	useEffect(
		() => () => {
			onInfoSidebarOpenChange?.(false);
		},
		[onInfoSidebarOpenChange],
	);

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

	useEffect(() => {
		if (!infoPanelOpen) return;
		let cancelled = false;
		void invoke("note_relationships", { note_id: relPath })
			.then((items) => {
				if (cancelled) return;
				setRelationships(items);
			})
			.catch(() => {
				if (cancelled) return;
				setRelationships([]);
			});
		return () => {
			cancelled = true;
		};
	}, [infoPanelOpen, relPath]);

	const handleInfoFrontmatterChange = useCallback(
		(nextFrontmatter: string | null) => {
			const normalizedFrontmatter = nextFrontmatter?.trim().length
				? nextFrontmatter
				: null;
			const { body } = splitYamlFrontmatter(textRef.current);
			const nextMarkdown = joinYamlFrontmatter(normalizedFrontmatter, body);
			if (nextMarkdown === textRef.current) return;
			hasUserEditsRef.current = true;
			textRef.current = nextMarkdown;
			setText(nextMarkdown);
			setInfoPanelText(nextMarkdown);
			// Property edits are discrete commits — save immediately so the
			// indexer picks up the change and databases/backlinks update.
			void runAutosave();
		},
		[runAutosave],
	);

	const toggleInfoPanel = useCallback(() => {
		setAiPanelOpen(() => false);
		setInfoPanelOpen((open) => {
			const nextOpen = !open;
			if (nextOpen) setInfoPanelText(textRef.current);
			return nextOpen;
		});
	}, [setAiPanelOpen]);

	const handleViewModeMenu = useCallback(
		(event: ReactMouseEvent<HTMLButtonElement>) => {
			void showNativePopupMenu(event, [
				{
					label: "Local connections",
					action: () => setLocalConnectionsOpen(true),
				},
				{ type: "separator" },
				{
					label: "Edit",
					checked: mode === "rich",
					action: () => setMode("rich"),
				},
				{
					label: "Preview",
					checked: mode === "preview",
					action: () => setMode("preview"),
				},
				{
					label: "Raw",
					checked: mode === "plain",
					action: () => setMode("plain"),
				},
			]).catch((error: unknown) => {
				console.error("Failed to show view mode menu", error);
			});
		},
		[mode],
	);

	return (
		<section className="filePreviewPane markdownEditorPane" ref={paneRef}>
			<div className="markdownEditorFloatActions">
				<div className="markdownEditorTopActions">
					<button
						type="button"
						className="markdownEditorMenuTrigger"
						onClick={handleViewModeMenu}
						aria-label="View mode options"
						title="View mode options"
						aria-haspopup="menu"
					>
						<HugeiconsIcon
							icon={SlidersHorizontalIcon}
							size="var(--icon-lg)"
							strokeWidth={0.9}
						/>
					</button>
					<button
						type="button"
						className="markdownEditorMenuTrigger markdownEditorAiTrigger"
						onClick={() => {
							if (!aiEnabled) {
								openSettings("ai");
								return;
							}
							setInfoPanelOpen(() => false);
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
						<HugeiconsIcon
							icon={AiBrain04Icon}
							size="var(--icon-lg)"
							strokeWidth={0.9}
						/>
					</button>
					<button
						type="button"
						className="markdownEditorMenuTrigger"
						onClick={toggleInfoPanel}
						aria-label={infoPanelOpen ? "Close info" : "Open info"}
						title={infoPanelOpen ? "Close info" : "Open info"}
						aria-pressed={infoPanelOpen}
					>
						<HugeiconsIcon
							icon={LayoutAlignRightIcon}
							size="var(--icon-lg)"
							strokeWidth={0.9}
						/>
					</button>
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
							pasteMarkdownBehavior="smart-markdown"
							onChange={(nextText) => {
								hasUserEditsRef.current = true;
								textRef.current = nextText;
								setText(nextText);
							}}
							onFrontmatterCommit={runAutosave}
							onEditorReady={setTocEditor}
							extractToNoteActions={extractToNoteActions}
						/>
					</div>
				</div>
			) : null}
			{showToc && !infoPanelOpen && !error && mode !== "plain" ? (
				<FloatingTOC
					headings={tocHeadings}
					activeId={tocActiveId}
					onSelectHeading={scrollToHeading}
				/>
			) : null}

			<NotesInfoSidebar
				open={infoPanelOpen}
				mode={mode}
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
				relationshipGroups={relationshipGroups}
				previewContext={previewContext}
				lastSavedMtimeMs={lastSavedMtimeMs}
				lineCount={lineCount}
				utf8SizeBytes={utf8SizeBytes}
				saveLabel={saveLabel}
				onClose={() => setInfoPanelOpen(false)}
			/>
			<LinkedNotePreviewSheet />

			<LocalNoteConnectionsDialog
				open={localConnectionsOpen}
				onOpenChange={setLocalConnectionsOpen}
				noteId={relPath}
				connectionsRefreshKey={lastSavedMtimeMs ?? 0}
			/>
		</section>
	);
}
