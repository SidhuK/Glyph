import {
	AiBrain04Icon,
	LayoutAlignRightIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	useAISidebarContext,
	useEditorRegistration,
	useGitSyncContext,
	useSpace,
	useUILayoutContext,
} from "../../contexts";
import { useEditorSaveIndicator } from "../../hooks/useEditorSaveIndicator";
import {
	OPEN_LOCAL_CONNECTIONS_EVENT,
	type OpenLocalConnectionsDetail,
	TOGGLE_NOTE_INFO_SIDEBAR_EVENT,
	type ToggleNoteInfoSidebarDetail,
} from "../../lib/appEvents";
import { extractErrorMessage } from "../../lib/errorUtils";
import { canShowGitHistory } from "../../lib/gitSyncUi";
import { setPrefetchedNote } from "../../lib/navigationPrefetch";
import {
	joinYamlFrontmatter,
	splitYamlFrontmatter,
} from "../../lib/notePreview";
import { groupRelationshipsByField } from "../../lib/relationships";
import {
	type BacklinkItem,
	type GitCommitDiff,
	type NoteRelationship,
	type TextFileDoc,
	type WorkspaceDatabasePreviewContext,
	invoke,
} from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { normalizeRelPath } from "../../utils/path";
import { LocalNoteConnectionsDialog } from "../connections/LocalNoteConnectionsDialog";
import { EditorViewModeSwitch } from "../editor/EditorViewModeSwitch";
import { NoteInlineEditor } from "../editor/NoteInlineEditor";
import { useTableOfContents } from "../editor/hooks/useTableOfContents";
import { parseWikiLink } from "../editor/markdown/wikiLinkCodec";
import type { RawMarkdownEditorHandle } from "../editor/raw/types";
import type {
	ExtractToNoteActions,
	NoteInlineEditorMode,
} from "../editor/types";
import { GitDiffView } from "./GitDiffView";
import { LinkedNotePreviewSheet } from "./LinkedNotePreviewSheet";
import { MarkdownFloatingToc } from "./MarkdownFloatingToc";
import { NotesInfoSidebar } from "./NotesInfoSidebar";
import {
	initialEditorMode,
	requiresPlainEditorMode,
} from "./editorModeSelection";
import {
	clearMarkdownDocCache,
	getCachedMarkdownDoc,
	peekCachedMarkdownDoc,
} from "./markdownCache";
import { analyzeNoteInfo } from "./noteInfoAnalysis";
import { useDeferredTocSource } from "./useDeferredTocSource";
import { useInternalAnchorNavigation } from "./useInternalAnchorNavigation";

interface MarkdownEditorPaneProps {
	relPath: string;
	onDirtyChange?: (dirty: boolean) => void;
	onInfoSidebarOpenChange?: (open: boolean) => void;
	gitDiff?: GitCommitDiff | null;
	onGitDiffChange?: (diff: GitCommitDiff | null) => void;
	initialDoc?: TextFileDoc | null;
	initialError?: string;
	extractToNoteActions?: ExtractToNoteActions;
}

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
	gitDiff = null,
	onGitDiffChange,
	initialDoc = null,
	initialError = "",
	extractToNoteActions,
}: MarkdownEditorPaneProps) {
	const initialText = initialDoc?.text ?? peekCachedMarkdownDoc(relPath) ?? "";
	const [text, setText] = useState(() => initialText);
	const [infoPanelText, setInfoPanelText] = useState("");
	const [savedText, setSavedText] = useState(() => initialText);
	const preferredEditorModeRef = useRef<NoteInlineEditorMode | null>(null);
	const [mode, setMode] = useState<NoteInlineEditorMode>(() =>
		initialEditorMode(initialText),
	);
	const [saving, setSaving] = useState(false);
	const [autosaveBusy, setAutosaveBusy] = useState(false);
	const [error, setError] = useState(() => initialError || "");
	const [infoPanelOpen, setInfoPanelOpen] = useState(false);
	const [localConnectionsOpen, setLocalConnectionsOpen] = useState(false);
	const [lastSavedMtimeMs, setLastSavedMtimeMs] = useState<number | null>(
		initialDoc?.mtime_ms ?? null,
	);
	const { flashPulse, clearPulse, resolveLabel } = useEditorSaveIndicator();
	const [linkedMentions, setLinkedMentions] = useState<BacklinkItem[]>([]);
	const [relationships, setRelationships] = useState<NoteRelationship[]>([]);

	const savedTextRef = useRef(savedText);
	const textRef = useRef(text);
	const resolveEditorModeForNote = useCallback(
		(markdown: string): NoteInlineEditorMode => {
			if (requiresPlainEditorMode(markdown)) return "plain";
			return preferredEditorModeRef.current ?? initialEditorMode(markdown);
		},
		[],
	);
	const applyEditorMode = useCallback((nextMode: NoteInlineEditorMode) => {
		preferredEditorModeRef.current = nextMode;
		setMode(nextMode);
	}, []);
	const requestEditorMode = useCallback(
		async (nextMode: NoteInlineEditorMode) => {
			if (nextMode !== "plain" && requiresPlainEditorMode(textRef.current)) {
				const modeLabel = nextMode === "rich" ? "Rich" : "Preview";
				const { confirm } = await import("@tauri-apps/plugin-dialog");
				const confirmed = await confirm(
					`This note may take a while to open and feel slower in ${modeLabel} mode. Raw is the fastest way to edit.`,
					{
						title: "Large note",
						okLabel: `Open in ${modeLabel}`,
						cancelLabel: "Stay in Raw",
					},
				);
				if (!confirmed) return;
			}
			applyEditorMode(nextMode);
		},
		[applyEditorMode],
	);
	const mtimeRef = useRef<number | null>(lastSavedMtimeMs);
	const documentSessionRef = useRef(0);
	const mountedRef = useRef(true);
	const saveRequestTokenRef = useRef(0);
	const autosaveInFlightRef = useRef(false);
	const autosaveQueuedRef = useRef(false);
	const hasUserEditsRef = useRef(false);
	const externalSyncTimerRef = useRef<number | null>(null);
	const pendingExternalReloadRef = useRef(false);
	const activeRelPathRef = useRef(relPath);
	const infoPanelOpenRef = useRef(infoPanelOpen);
	const paneRef = useRef<HTMLElement | null>(null);
	const contentScrollRef = useRef<HTMLDivElement | null>(null);
	const { spacePath } = useSpace();
	const previousSpacePathRef = useRef<string | null>(spacePath);
	const { tocSource, handleEditorReady } = useDeferredTocSource();
	const rawEditorRef = useRef<RawMarkdownEditorHandle | null>(null);
	const handleRawEditorReady = useCallback(
		(editor: RawMarkdownEditorHandle | null) => {
			rawEditorRef.current = editor;
		},
		[],
	);
	const {
		headings: tocHeadings,
		activeId: tocActiveId,
		getPreviewForHeading,
		scrollToHeading,
	} = useTableOfContents(
		tocSource?.editor ?? null,
		tocSource?.contentRoot ?? null,
	);
	const [previewContext, setPreviewContext] =
		useState<WorkspaceDatabasePreviewContext | null>(null);
	const { openSettings, showToc } = useUILayoutContext();
	const { aiEnabled, aiPanelOpen, setAiPanelOpen } = useAISidebarContext();
	const { status: gitSyncStatus } = useGitSyncContext();
	const hasSupportedGit = canShowGitHistory(gitSyncStatus);
	infoPanelOpenRef.current = infoPanelOpen;

	useEffect(() => {
		if (hasSupportedGit) return;
		onGitDiffChange?.(null);
	}, [hasSupportedGit, onGitDiffChange]);

	const isDirty = text !== savedText;
	const { frontmatter: currentFrontmatter, body: currentBody } = useMemo(
		() =>
			infoPanelOpen
				? splitYamlFrontmatter(infoPanelText)
				: { frontmatter: null, body: "" },
		[infoPanelOpen, infoPanelText],
	);
	const infoAnalysis = useMemo(
		() => analyzeNoteInfo(infoPanelText, currentBody, mode === "plain"),
		[currentBody, infoPanelText, mode],
	);
	const utf8SizeBytes = useMemo(() => {
		if (!infoPanelOpen) return 0;
		return UTF8_ENCODER.encode(infoPanelText).length;
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
	const visibleHeadings =
		mode === "plain" ? infoAnalysis.headings : tocHeadings;
	const visibleActiveHeadingId = mode === "plain" ? null : tocActiveId;
	const selectVisibleHeading = useCallback(
		(heading: (typeof visibleHeadings)[number]) => {
			if (mode === "plain") {
				rawEditorRef.current?.selectRange(heading.pos, heading.pos);
				return;
			}
			scrollToHeading(heading);
		},
		[mode, scrollToHeading],
	);

	const getPlainText = useCallback(() => textRef.current, []);
	useInternalAnchorNavigation({
		relPath,
		mode,
		getPlainText,
		tocHeadings,
		selectVisibleHeading,
	});

	const saveLabel =
		resolveLabel({
			isDirty,
			saving,
			autosaveBusy,
			hasSavedBefore: lastSavedMtimeMs !== null,
		}) ?? "Ready";

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
		// `initialDoc` is a seed for the pane. Autosave also refreshes that cache,
		// so do not treat the resulting object identity change as a new document.
		if (
			activeRelPathRef.current === relPath &&
			initialDoc?.text === textRef.current
		) {
			return;
		}
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
		setInfoPanelText("");
		setSavedText(cached);
		setLastSavedMtimeMs(initialDoc?.mtime_ms ?? null);
		setSaving(false);
		setAutosaveBusy(false);
		clearPulse();
		hasUserEditsRef.current = false;
		setError(initialError);
		if (activeRelPathRef.current !== relPath) {
			setInfoPanelOpen(false);
			setMode(resolveEditorModeForNote(cached));
		}
		activeRelPathRef.current = relPath;
		setLocalConnectionsOpen(false);
		setPreviewContext(null);
		setLinkedMentions([]);
		if (initialDoc) {
			setPrefetchedNote(relPath, initialDoc);
		}
	}, [clearPulse, initialDoc, initialError, relPath, resolveEditorModeForNote]);

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
		clearPulse();
		clearMarkdownDocCache();
		if (spacePath === null) {
			return;
		}
	}, [clearPulse, spacePath]);

	const loadDoc = useCallback(
		async (showRefreshFeedback = false) => {
			const sessionId = documentSessionRef.current;
			setError("");
			try {
				const doc = await invoke("space_read_text", { path: relPath });
				if (!isCurrentSession(sessionId)) return;
				const shouldReplaceText = textRef.current === savedTextRef.current;
				const shouldChooseInitialMode =
					textRef.current.length === 0 && savedTextRef.current.length === 0;
				setPrefetchedNote(relPath, doc);
				if (shouldReplaceText) {
					if (shouldChooseInitialMode) {
						setMode(resolveEditorModeForNote(doc.text));
					}
					textRef.current = doc.text;
					setText(doc.text);
					if (infoPanelOpenRef.current) setInfoPanelText(doc.text);
				}
				savedTextRef.current = doc.text;
				mtimeRef.current = doc.mtime_ms;
				setSavedText(doc.text);
				setLastSavedMtimeMs(doc.mtime_ms);
				hasUserEditsRef.current = false;
				setPrefetchedNote(relPath, doc);
				if (showRefreshFeedback) {
					flashPulse("reloaded");
				}
			} catch (e) {
				if (!isCurrentSession(sessionId)) return;
				setError(extractErrorMessage(e));
			}
		},
		[flashPulse, isCurrentSession, relPath, resolveEditorModeForNote],
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
			if (infoPanelOpenRef.current) setInfoPanelText(doc.text);
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
				flashPulse("saved");
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
		[flashPulse, isCurrentSession, relPath],
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
			setMode: requestEditorMode,
		}),
		[isDirty, onSave, relPath, requestEditorMode],
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
	const closeInfoPanel = useCallback(() => setInfoPanelOpen(false), []);

	const isLargeNote = requiresPlainEditorMode(text);

	return (
		<section className="filePreviewPane markdownEditorPane" ref={paneRef}>
			<div className="markdownEditorFloatActions">
				<div className="markdownEditorToolbar">
					<EditorViewModeSwitch
						mode={mode}
						largeNote={isLargeNote}
						onModeChange={requestEditorMode}
					/>
					<div className="markdownEditorToolbarDivider" aria-hidden="true" />
					<div className="markdownEditorToolbarActions">
						<button
							type="button"
							className="markdownEditorToolbarBtn"
							data-active={aiEnabled && aiPanelOpen ? true : undefined}
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
								size="var(--icon-md)"
								strokeWidth={0.9}
							/>
						</button>
						<button
							type="button"
							className="markdownEditorToolbarBtn"
							data-active={infoPanelOpen || undefined}
							onClick={toggleInfoPanel}
							aria-label={infoPanelOpen ? "Close info" : "Open info"}
							title={infoPanelOpen ? "Close info" : "Open info"}
							aria-pressed={infoPanelOpen}
						>
							<HugeiconsIcon
								icon={LayoutAlignRightIcon}
								size="var(--icon-md)"
								strokeWidth={0.9}
							/>
						</button>
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
						{gitDiff ? (
							<GitDiffView
								diff={gitDiff}
								onBack={() => onGitDiffChange?.(null)}
							/>
						) : (
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
								onEditorReady={handleEditorReady}
								onRawEditorReady={handleRawEditorReady}
								extractToNoteActions={extractToNoteActions}
							/>
						)}
					</div>
				</div>
			) : null}
			<MarkdownFloatingToc
				headings={tocHeadings}
				activeId={tocActiveId}
				getHeadingPreview={getPreviewForHeading}
				onSelectHeading={scrollToHeading}
				visible={
					showToc && !infoPanelOpen && !gitDiff && !error && mode !== "plain"
				}
			/>

			<NotesInfoSidebar
				open={infoPanelOpen}
				hasError={Boolean(error)}
				relPath={relPath}
				frontmatter={currentFrontmatter}
				onFrontmatterChange={handleInfoFrontmatterChange}
				stats={infoAnalysis.stats}
				taskSummary={infoAnalysis.taskSummary}
				tocHeadings={visibleHeadings}
				tocActiveId={visibleActiveHeadingId}
				onSelectHeading={selectVisibleHeading}
				backlinks={sidebarBacklinks}
				linkedNotes={linkedNotes}
				relationshipGroups={relationshipGroups}
				previewContext={previewContext}
				lastSavedMtimeMs={lastSavedMtimeMs}
				lineCount={infoAnalysis.lineCount}
				utf8SizeBytes={utf8SizeBytes}
				saveLabel={saveLabel}
				gitSyncStatus={gitSyncStatus}
				selectedGitCommitHash={gitDiff?.commit.hash ?? null}
				onSelectGitDiff={onGitDiffChange ?? undefined}
				onClose={closeInfoPanel}
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
