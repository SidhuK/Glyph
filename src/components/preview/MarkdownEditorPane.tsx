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
import {
	OPEN_LOCAL_CONNECTIONS_EVENT,
	type OpenLocalConnectionsDetail,
	TOGGLE_NOTE_INFO_SIDEBAR_EVENT,
	type ToggleNoteInfoSidebarDetail,
} from "../../lib/appEvents";
import { canShowGitHistory } from "../../lib/gitSyncUi";
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
import { normalizeRelPath } from "../../utils/path";
import { LocalNoteConnectionsDialog } from "../connections/LocalNoteConnectionsDialog";
import { EditorViewModeSwitch } from "../editor/EditorViewModeSwitch";
import { NoteInlineEditor } from "../editor/NoteInlineEditor";
import { useTableOfContents } from "../editor/hooks/useTableOfContents";
import { parseWikiLink } from "../editor/markdown/wikiLinkCodec";
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
import { peekCachedMarkdownDoc } from "./markdownCache";
import { analyzeNoteInfo } from "./noteInfoAnalysis";
import { useDeferredTocSource } from "./useDeferredTocSource";
import { useInternalAnchorNavigation } from "./useInternalAnchorNavigation";
import { useMarkdownDocumentSession } from "./useMarkdownDocumentSession";

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
	const [infoPanelText, setInfoPanelText] = useState("");
	const preferredEditorModeRef = useRef<NoteInlineEditorMode | null>(null);
	const initialText = initialDoc?.text ?? peekCachedMarkdownDoc(relPath) ?? "";
	const [mode, setMode] = useState<NoteInlineEditorMode>(() =>
		initialEditorMode(initialText),
	);
	const [infoPanelOpen, setInfoPanelOpen] = useState(false);
	const [localConnectionsOpen, setLocalConnectionsOpen] = useState(false);
	const [linkedMentions, setLinkedMentions] = useState<BacklinkItem[]>([]);
	const [relationships, setRelationships] = useState<NoteRelationship[]>([]);
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
	const infoPanelOpenRef = useRef(infoPanelOpen);
	const paneRef = useRef<HTMLElement | null>(null);
	const contentScrollRef = useRef<HTMLDivElement | null>(null);
	const { spacePath } = useSpace();
	const { tocSource, handleEditorReady } = useDeferredTocSource();
	const handleDocumentTextReplaced = useCallback((nextText: string) => {
		if (infoPanelOpenRef.current) setInfoPanelText(nextText);
	}, []);
	const {
		error,
		flushRawMarkdown,
		handleRawEditorReady,
		isDirty,
		lastSavedMtimeMs,
		markUserEdit,
		onSave,
		rawEditorRef,
		runAutosave,
		saveLabel,
		text,
		textRef,
	} = useMarkdownDocumentSession({
		initialDoc,
		initialError,
		onTextReplaced: handleDocumentTextReplaced,
		relPath,
		resolveEditorModeForNote,
		setEditorMode: setMode,
		spacePath,
	});
	const requestEditorMode = useCallback(
		async (nextMode: NoteInlineEditorMode) => {
			flushRawMarkdown();
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
		[applyEditorMode, flushRawMarkdown, textRef],
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

	// Reset note-local sidebar state when the active note identity changes.
	const activeNoteKey = `${spacePath ?? ""}\0${relPath}`;
	const [sidebarNoteKey, setSidebarNoteKey] = useState(activeNoteKey);
	if (sidebarNoteKey !== activeNoteKey) {
		setSidebarNoteKey(activeNoteKey);
		setInfoPanelText("");
		setInfoPanelOpen(false);
		setLocalConnectionsOpen(false);
		setPreviewContext(null);
		setLinkedMentions([]);
		setRelationships([]);
	}

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
		[mode, rawEditorRef, scrollToHeading],
	);

	const getPlainText = useCallback(() => textRef.current, [textRef]);
	useInternalAnchorNavigation({
		relPath,
		mode,
		getPlainText,
		tocHeadings,
		selectVisibleHeading,
	});

	useEffect(() => {
		if (!infoPanelOpen) return;
		setInfoPanelText(textRef.current);
	}, [infoPanelOpen, textRef]);

	useEffect(() => {
		if (!infoPanelOpen) return;
		const timer = window.setTimeout(() => {
			setInfoPanelText(text);
		}, INFO_PANEL_DERIVATION_DEBOUNCE_MS);
		return () => window.clearTimeout(timer);
	}, [infoPanelOpen, text]);

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
	}, [relPath, setAiPanelOpen, textRef]);

	useEffect(() => {
		if (aiPanelOpen) setInfoPanelOpen(false);
	}, [aiPanelOpen]);

	// Register editor state for keyboard shortcuts
	const editorState = useMemo(
		() => ({
			relPath,
			isDirty,
			save: onSave,
			getMarkdown: () => textRef.current,
			setMode: requestEditorMode,
		}),
		[isDirty, onSave, relPath, requestEditorMode, textRef],
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
			markUserEdit(nextMarkdown);
			setInfoPanelText(nextMarkdown);
			// Property edits are discrete commits — save immediately so the
			// indexer picks up the change and databases/backlinks update.
			void runAutosave();
		},
		[markUserEdit, runAutosave, textRef],
	);

	const toggleInfoPanel = useCallback(() => {
		setAiPanelOpen(() => false);
		setInfoPanelOpen((open) => {
			const nextOpen = !open;
			if (nextOpen) setInfoPanelText(textRef.current);
			return nextOpen;
		});
	}, [setAiPanelOpen, textRef]);
	const closeInfoPanel = useCallback(() => setInfoPanelOpen(false), []);

	const isLargeNote = requiresPlainEditorMode(text);
	const isAiPanelActive = aiEnabled && aiPanelOpen;

	return (
		<section className="filePreviewPane markdownEditorPane" ref={paneRef}>
			<div className="markdownEditorFloatActions">
				<div className="markdownEditorToolbar">
					<EditorViewModeSwitch
						mode={mode}
						largeNote={isLargeNote}
						onModeChange={requestEditorMode}
					/>
					<div className="markdownEditorToolbarActions">
						<button
							type="button"
							className="markdownEditorToolbarBtn"
							data-active={isAiPanelActive || undefined}
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
								strokeWidth={isAiPanelActive ? 1.5 : 1}
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
								strokeWidth={infoPanelOpen ? 1.5 : 1}
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
									markUserEdit(nextText);
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
