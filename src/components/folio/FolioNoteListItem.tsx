import { openUrl } from "@tauri-apps/plugin-opener";
import { useDraggable } from "@dnd-kit/react";
import {
	type CSSProperties,
	type KeyboardEvent,
	type MouseEvent,
	forwardRef,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
	useDateDisplayFormat,
	useEditorContext,
	useFileTreeContext,
	useSpace,
} from "../../contexts";
import { useHoverPrefetch } from "../../hooks/useHoverPrefetch";
import { formatDisplayDate } from "../../lib/dateDisplayFormat";
import { openMarkdownInExternalWindow } from "../../lib/externalMarkdown";
import { normalizeInlineMarkdown } from "../../lib/markdownUtils";
import { showNativeContextMenu } from "../../lib/nativeContextMenu";
import type { FileTreeAppearance, NoteTaskSummary } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { basename, displayNameFromPath, parentDir, splitEditableFileName } from "../../utils/path";
import { InlineRenameInput } from "../InlineRenameInput";
import { TaskProgressIndicator } from "../checklists/TaskProgressIndicator";
import { DatabaseColumnIcon } from "../database/DatabaseColumnIcon";
import { formatDatabaseTagLabel } from "../database/databaseTagLabel";
import { getEditorTextColorOption, isEditorTextColor } from "../editor/textColors";
import { buildFileTreeFileNativeMenu } from "../filetree/fileTreeNativeContextMenu";
import {
	FILE_TREE_ENTRY_SENSORS,
	FILE_TREE_ENTRY_TYPE,
	fileTreeEntryDragId,
} from "../filetree/fileTreeDnd";
import { getFileTypeInfo } from "../filetree/fileTypeUtils";
import type { FolioItem } from "./useFolioNotes";

interface FolioNoteListItemProps {
	note: FolioItem;
	selected: boolean;
	onOpen: (path: string) => void;
	onOpenInNewTab: (path: string) => void;
	onShowInFolder: (path: string) => void;
	onPrefetch: (path: string) => void;
	onRename?: (path: string) => void;
	onDelete: (path: string) => void;
	onDuplicate: (path: string) => void;
	onNewFileInDir: (dirPath: string) => unknown;
	onCreateFromTemplateInDir: (dirPath: string) => unknown;
	onRequestCreateFolder: (dirPath: string) => unknown;
	onFocus: () => void;
	taskSummary?: NoteTaskSummary | null;
	isRenaming?: boolean;
	onCommitRename: (path: string, nextName: string) => Promise<boolean> | boolean;
	onCancelRename: () => void;
	appearance?: FileTreeAppearance | null;
	onOpenAppearancePicker: (path: string) => void;
	iconNameForTag: (tag: string) => string;
	className?: string;
	style?: CSSProperties;
	virtualIndex?: number;
}

type FolioImageRef =
	| { kind: "markdown-link"; href: string }
	| { kind: "wiki-image-link"; href: string }
	| { kind: "direct"; src: string };

const FOLIO_THUMBNAIL_MAX_BYTES = 4 * 1024 * 1024;
const FOLIO_NOTE_IMAGE_SCAN_MAX_BYTES = 2 * 1024 * 1024;
const FOLIO_NOTE_URL_SCAN_MAX_BYTES = 256 * 1024;
const FOLIO_NOTE_URL_READ_CONCURRENCY = 4;
const FOLIO_DRAG_CLICK_DISTANCE_PX = 5;
const IMAGE_EXT_RE = /\.(?:png|jpe?g|webp|gif|svg|bmp|avif|tiff?)(?:[#?].*)?$/i;
const DIRECT_IMAGE_SRC_RE = /^(?:https?:|data:|blob:)/i;
const URL_RE = /https?:\/\/[^\s<>"'`\]}]+/i;
let activeFolioUrlReads = 0;
const queuedFolioUrlReads: Array<() => void> = [];

interface FolioImageCandidate {
	index: number;
	ref: FolioImageRef;
}

function previewText(preview: string, title: string, emptyLabel: string): string {
	const lowerTitle = title.trim().toLowerCase();
	const lines = preview.replace(/\r\n?/g, "\n").split("\n");
	const previewLines: string[] = [];

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line || /^#\s+/.test(line)) continue;

		const withoutMarkdownPrefix = line
			.replace(/^#{2,6}\s+/, "")
			.replace(/^>\s?/, "")
			.replace(/^(?:[-*+]|\d+\.)\s+/, "")
			.replace(/^\[(?: |x|X)\]\s+/, "");
		const normalized = normalizeInlineMarkdown(withoutMarkdownPrefix);
		if (!normalized) continue;

		if (lowerTitle && normalized.toLowerCase().startsWith(lowerTitle)) {
			const withoutTitle = normalized.slice(title.length).trim();
			if (withoutTitle) previewLines.push(withoutTitle);
			continue;
		}

		previewLines.push(normalized);
	}

	return previewLines.join(" ") || emptyLabel;
}

function cleanUrl(rawUrl: string): string {
	return rawUrl.replace(/[.,;:!?)]+$/g, "");
}

function extractFirstUrl(text: string): string {
	const match = text.match(URL_RE);
	return match?.[0] ? cleanUrl(match[0]) : "";
}

function runLimitedFolioUrlRead<T>(read: () => Promise<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const run = () => {
			activeFolioUrlReads += 1;
			read()
				.then(resolve, reject)
				.finally(() => {
					activeFolioUrlReads = Math.max(0, activeFolioUrlReads - 1);
					queuedFolioUrlReads.shift()?.();
				});
		};

		if (activeFolioUrlReads < FOLIO_NOTE_URL_READ_CONCURRENCY) {
			run();
			return;
		}

		queuedFolioUrlReads.push(run);
	});
}

function urlLabel(url: string): string {
	try {
		const parsed = new URL(url);
		return parsed.hostname.replace(/^www\./i, "") || url;
	} catch {
		return url.replace(/^https?:\/\//i, "");
	}
}

function markdownImageHref(rawHref: string): string {
	const href = rawHref.trim().replace(/^<|>$/g, "");
	const titleMatch = href.match(/^(.+?)(?:\s+["'][^"'\n]*["'])$/);
	return (titleMatch?.[1] ?? href).trim();
}

function imageRefFromHref(href: string): FolioImageRef | null {
	if (!href) return null;
	if (DIRECT_IMAGE_SRC_RE.test(href)) return { kind: "direct", src: href };
	if (IMAGE_EXT_RE.test(href)) return { kind: "markdown-link", href };
	return null;
}

function referenceImageDefinitions(markdown: string): Map<string, string> {
	const definitions = new Map<string, string>();
	for (const match of markdown.matchAll(/^\s*\[([^\]\n]+)\]:\s*(\S+)/gm)) {
		const label = (match[1] ?? "").trim().toLowerCase();
		const href = markdownImageHref(match[2] ?? "");
		if (label && href) definitions.set(label, href);
	}
	return definitions;
}

function extractFirstImageRef(markdown: string): FolioImageRef | null {
	const candidates: FolioImageCandidate[] = [];

	for (const match of markdown.matchAll(/!\[\[([^\]\n]+)\]\]/g)) {
		const target = (match[1] ?? "").split("|")[0]?.split("#")[0]?.trim() ?? "";
		if (target && IMAGE_EXT_RE.test(target)) {
			candidates.push({
				index: match.index ?? Number.MAX_SAFE_INTEGER,
				ref: { kind: "wiki-image-link", href: target },
			});
		}
	}

	for (const match of markdown.matchAll(/!\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
		const href = markdownImageHref(match[1] ?? "");
		const ref = imageRefFromHref(href);
		if (ref) {
			candidates.push({
				index: match.index ?? Number.MAX_SAFE_INTEGER,
				ref,
			});
		}
	}

	for (const match of markdown.matchAll(/<img\b[^>]*\bsrc=(["'])(.*?)\1[^>]*>/gi)) {
		const ref = imageRefFromHref((match[2] ?? "").trim());
		if (ref) {
			candidates.push({
				index: match.index ?? Number.MAX_SAFE_INTEGER,
				ref,
			});
		}
	}

	const definitions = referenceImageDefinitions(markdown);
	for (const match of markdown.matchAll(/!\[[^\]\n]*\]\[([^\]\n]+)\]/g)) {
		const label = (match[1] ?? "").trim().toLowerCase();
		const href = definitions.get(label);
		const ref = href ? imageRefFromHref(href) : null;
		if (ref) {
			candidates.push({
				index: match.index ?? Number.MAX_SAFE_INTEGER,
				ref,
			});
		}
	}

	for (const match of markdown.matchAll(/https?:\/\/[^\s<>)"]+/gi)) {
		const href = (match[0] ?? "").trim();
		if (!IMAGE_EXT_RE.test(href)) continue;
		candidates.push({
			index: match.index ?? Number.MAX_SAFE_INTEGER,
			ref: { kind: "direct", src: href },
		});
	}

	candidates.sort((left, right) => left.index - right.index);
	return candidates[0]?.ref ?? null;
}

function useFolioThumbnail(note: FolioItem): string {
	const previewImageRef = useMemo(
		() => (note.is_markdown ? extractFirstImageRef(note.preview) : null),
		[note.is_markdown, note.preview],
	);
	const [src, setSrc] = useState("");

	useEffect(() => {
		let cancelled = false;
		setSrc("");
		if (!note.is_markdown) return;
		void (async () => {
			try {
				let imageRef = previewImageRef;
				if (!imageRef) {
					const doc = await invoke("space_read_text_preview", {
						path: note.note_path,
						max_bytes: FOLIO_NOTE_IMAGE_SCAN_MAX_BYTES,
					});
					if (cancelled) return;
					imageRef = extractFirstImageRef(doc.text);
				}
				if (!imageRef) return;
				if (imageRef.kind === "direct") {
					setSrc(imageRef.src);
					return;
				}
				const relPath =
					imageRef.kind === "wiki-image-link"
						? await invoke("space_resolve_image_wikilink", {
								target: imageRef.href,
							})
						: await invoke("space_resolve_markdown_link", {
								href: imageRef.href,
								sourcePath: note.note_path,
							});
				if (!relPath || cancelled) return;
				const preview = await invoke("space_read_binary_preview", {
					path: relPath,
					max_bytes: FOLIO_THUMBNAIL_MAX_BYTES,
				});
				if (!cancelled && !preview.truncated) {
					setSrc(preview.data_url);
				}
			} catch {
				if (!cancelled) setSrc("");
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [note.is_markdown, note.note_path, previewImageRef]);

	return src;
}

function useFolioFirstUrl(note: FolioItem): string {
	const previewUrl = useMemo(() => extractFirstUrl(note.preview), [note.preview]);
	const [url, setUrl] = useState(previewUrl);

	useEffect(() => {
		let cancelled = false;
		setUrl(previewUrl);
		if (!note.is_markdown) return;
		void (async () => {
			try {
				const doc = await runLimitedFolioUrlRead(async () => {
					if (cancelled) return null;
					return await invoke("space_read_text_preview", {
						path: note.note_path,
						max_bytes: FOLIO_NOTE_URL_SCAN_MAX_BYTES,
					});
				});
				if (cancelled || !doc) return;
				setUrl(extractFirstUrl(doc.text));
			} catch {
				if (!cancelled) setUrl(previewUrl);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [note.is_markdown, note.note_path, previewUrl]);

	return url;
}

export const FolioNoteListItem = memo(
	forwardRef<HTMLLIElement, FolioNoteListItemProps>(function FolioNoteListItem(
		{
			note,
			selected,
			onOpen,
			onOpenInNewTab,
			onShowInFolder,
			onPrefetch,
			onRename,
			onDelete,
			onDuplicate,
			onNewFileInDir,
			onCreateFromTemplateInDir,
			onRequestCreateFolder,
			onFocus,
			taskSummary = null,
			isRenaming = false,
			onCommitRename,
			onCancelRename,
			appearance = null,
			onOpenAppearancePicker,
			iconNameForTag,
			className,
			style,
			virtualIndex,
		},
		ref,
	) {
		const { t } = useTranslation("shell");
		const dateDisplayFormat = useDateDisplayFormat();
		const untitledLabel = t("folio.untitled");
		const title = note.title.trim() || displayNameFromPath(note.note_path) || untitledLabel;
		const isMarkdown = note.is_markdown;
		const { spacePath } = useSpace();
		const { getEditorState, saveCurrentEditor } = useEditorContext();
		const { pinnedFiles, togglePinnedFile } = useFileTreeContext();
		const isPinned = pinnedFiles.includes(note.note_path);
		const { stem: fileStem, ext: fileExt } = splitEditableFileName(basename(note.note_path));
		const { Icon, color } = getFileTypeInfo(note.note_path, isMarkdown);
		const customColor =
			appearance?.color && isEditorTextColor(appearance.color) ? appearance.color : null;
		const rowStyle = customColor
			? ({
					"--folio-file-color": `var(${getEditorTextColorOption(customColor).cssVar})`,
				} as CSSProperties)
			: undefined;
		const iconColor = customColor ? "var(--folio-file-color)" : color;
		const extBadge = !isMarkdown && fileExt ? fileExt.slice(1) : "";
		const preview = useMemo(() => {
			return previewText(note.preview, title, t("folio.noPreview"));
		}, [note.preview, t, title]);
		const updated =
			isMarkdown && note.updated
				? formatDisplayDate(note.updated, dateDisplayFormat)
				: t("folio.noDate");
		const visibleTags = note.tags.slice(0, 2);
		const hiddenTagCount = Math.max(0, note.tags.length - visibleTags.length);
		const folder = parentDir(note.note_path);
		const thumbnailSrc = useFolioThumbnail(note);
		const firstUrl = useFolioFirstUrl(note);
		const firstUrlLabel = firstUrl ? urlLabel(firstUrl) : "";
		const taskProgress =
			taskSummary && taskSummary.total_count > 0 ? (
				<TaskProgressIndicator summary={taskSummary} className="folioNoteTaskProgress" />
			) : null;
		const { cancelHoverPrefetch, hoverPrefetchProps } = useHoverPrefetch(() => {
			if (isMarkdown) onPrefetch(note.note_path);
		});
		const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
		const suppressDragClickRef = useRef(false);
		const {
			ref: draggableRef,
			handleRef,
			isDragging,
		} = useDraggable({
			id: fileTreeEntryDragId("file", note.note_path),
			type: FILE_TREE_ENTRY_TYPE,
			sensors: FILE_TREE_ENTRY_SENSORS,
			data: {
				path: note.note_path,
				kind: "file",
			},
		});
		const setRowRef = useCallback(
			(element: HTMLButtonElement | null) => {
				draggableRef(element);
				handleRef(element);
			},
			[draggableRef, handleRef],
		);
		const handleRevealInFinder = useCallback(async () => {
			try {
				await invoke("space_reveal_path", { path: note.note_path });
			} catch (error) {
				console.error("Failed to show file in Finder", error);
			}
		}, [note.note_path]);
		const handleOpenInSeparateWindow = useCallback(async () => {
			const editorState = getEditorState();
			if (editorState?.relPath === note.note_path && editorState.isDirty) {
				await saveCurrentEditor();
			}
			await openMarkdownInExternalWindow(note.note_path);
		}, [getEditorState, note.note_path, saveCurrentEditor]);
		const handleContextMenu = useCallback(
			(event: MouseEvent) => {
				void showNativeContextMenu(
					event,
					buildFileTreeFileNativeMenu({
						path: note.note_path,
						spacePath,
						isMarkdown,
						isPinned,
						onOpen: () => onOpen(note.note_path),
						onOpenInNewTab: () => onOpenInNewTab(note.note_path),
						onOpenInNewWindow: () => void handleOpenInSeparateWindow(),
						onBrowseFolder: () => onShowInFolder(note.note_path),
						onRevealInFinder: () => void handleRevealInFinder(),
						...(onRename ? { onRename: () => onRename(note.note_path) } : {}),
						onDuplicate: () => onDuplicate(note.note_path),
						onTogglePinned: () => void togglePinnedFile(note.note_path),
						onOpenAppearancePicker: () => onOpenAppearancePicker(note.note_path),
						onNewFile: () => void onNewFileInDir(folder),
						onCreateFromTemplate: () => void onCreateFromTemplateInDir(folder),
						onCreateFolder: () => void onRequestCreateFolder(folder),
						onDelete: () => onDelete(note.note_path),
					}),
				).catch((error: unknown) => {
					console.error("Failed to show folio context menu", error);
				});
			},
			[
				folder,
				handleOpenInSeparateWindow,
				handleRevealInFinder,
				isMarkdown,
				isPinned,
				note.note_path,
				onCreateFromTemplateInDir,
				onDelete,
				onDuplicate,
				onNewFileInDir,
				onOpen,
				onOpenAppearancePicker,
				onOpenInNewTab,
				onRename,
				onRequestCreateFolder,
				onShowInFolder,
				spacePath,
				togglePinnedFile,
			],
		);
		const fileIcon = appearance?.icon ? (
			<DatabaseColumnIcon
				iconName={appearance.icon}
				size="var(--icon-lg)"
				className="folioNoteFileIcon"
			/>
		) : (
			<Icon
				size="var(--icon-lg)"
				className="folioNoteFileIcon"
				style={{ color: iconColor }}
				aria-hidden="true"
			/>
		);
		const noteTitleIcon = (
			<span
				role="button"
				tabIndex={0}
				className="folioNoteTitleIcon"
				aria-label={t("fileTree.showInFolder")}
				onClick={(event) => {
					event.preventDefault();
					event.stopPropagation();
					onShowInFolder(note.note_path);
				}}
				onKeyDown={(event: KeyboardEvent<HTMLSpanElement>) => {
					if (event.key !== "Enter" && event.key !== " ") return;
					event.preventDefault();
					event.stopPropagation();
					onShowInFolder(note.note_path);
				}}
			>
				{fileIcon}
			</span>
		);
		const rowDetails = (
			<div className="folioNoteBody">
				<span className="folioNoteCopy">
					<span className="folioNotePreview">{preview}</span>
				</span>
				{thumbnailSrc ? (
					<span className="folioNoteThumbnail" aria-hidden="true">
						<img src={thumbnailSrc} alt="" />
					</span>
				) : null}
				<span className="folioNoteFooter">
					<span className="folioNoteTags">
						{firstUrl ? (
							<a
								href={firstUrl}
								className="databaseCellPill folioNoteTag folioNoteUrl"
								title={firstUrl}
								onClick={(event) => {
									event.preventDefault();
									event.stopPropagation();
									void openUrl(firstUrl);
								}}
							>
								<DatabaseColumnIcon
									iconName="link"
									className="folioNoteUrlIcon"
									size="var(--icon-xs)"
								/>
								{firstUrlLabel}
							</a>
						) : null}
						{visibleTags.length > 0 ? (
							visibleTags.map((tag) => (
								<span
									key={tag}
									className="databaseCellPill folioNoteTag"
									title={formatDatabaseTagLabel(tag)}
								>
									<DatabaseColumnIcon
										iconName={iconNameForTag(tag)}
										className="folioNoteTagIcon"
										size="var(--icon-xs)"
									/>
									{formatDatabaseTagLabel(tag)}
								</span>
							))
						) : firstUrl ? null : (
							<span className="folioNoteFolder">{folder || t("folio.noFolder")}</span>
						)}
						{hiddenTagCount > 0 ? (
							<span className="databaseCellPill databaseCellPillMore folioNoteTag">
								+{hiddenTagCount}
							</span>
						) : null}
					</span>
					<span className="folioNoteDates">{updated}</span>
				</span>
			</div>
		);
		const fileDetails = (
			<span className="folioFileLine">
				{fileIcon}
				<span className="folioFileName">{fileStem || title}</span>
				{extBadge ? <span className="fileTreeExtBadge">{extBadge}</span> : null}
			</span>
		);

		return (
			<li
				ref={ref}
				className={`folioNoteListItem${className ? ` ${className}` : ""}`}
				style={style}
				data-index={virtualIndex}
			>
				{isRenaming ? (
					<div
						className="folioNoteRow"
						data-state={selected ? "selected" : "idle"}
						data-kind={isMarkdown ? "markdown" : "file"}
						data-folio-note-path={note.note_path}
						title={note.note_path}
						style={rowStyle}
					>
						<span className="folioNoteRowTop">
							<InlineRenameInput
								key={`${note.note_path}:${fileStem}`}
								initialValue={fileStem || displayNameFromPath(note.note_path) || untitledLabel}
								className="plainTextInput folioNoteRenameInput"
								placeholder={untitledLabel}
								onCommit={(draftName) => {
									const initialName =
										fileStem || displayNameFromPath(note.note_path) || untitledLabel;
									const nextStem = draftName.trim() || fileStem || initialName.trim();
									return onCommitRename(note.note_path, `${nextStem}${fileExt}`);
								}}
								onCancel={onCancelRename}
							/>
							{taskProgress}
						</span>
						{isMarkdown ? rowDetails : fileDetails}
					</div>
				) : (
					<button
						ref={setRowRef}
						type="button"
						className="folioNoteRow"
						data-state={selected ? "selected" : "idle"}
						data-kind={isMarkdown ? "markdown" : "file"}
						data-folio-note-path={note.note_path}
						aria-current={selected ? "page" : undefined}
						onClick={(event) => {
							cancelHoverPrefetch();
							if (suppressDragClickRef.current) {
								suppressDragClickRef.current = false;
								return;
							}
							if (isMarkdown && (event.metaKey || event.ctrlKey)) {
								onOpenInNewTab(note.note_path);
								return;
							}
							onOpen(note.note_path);
						}}
						onPointerDown={(event) => {
							event.currentTarget.setPointerCapture(event.pointerId);
							dragOriginRef.current = { x: event.clientX, y: event.clientY };
							suppressDragClickRef.current = false;
						}}
						onPointerMove={(event) => {
							const origin = dragOriginRef.current;
							if (!origin) return;
							const distanceX = event.clientX - origin.x;
							const distanceY = event.clientY - origin.y;
							if (
								distanceX * distanceX + distanceY * distanceY >=
								FOLIO_DRAG_CLICK_DISTANCE_PX * FOLIO_DRAG_CLICK_DISTANCE_PX
							) {
								suppressDragClickRef.current = true;
							}
						}}
						onPointerCancel={() => {
							dragOriginRef.current = null;
							suppressDragClickRef.current = false;
						}}
						onContextMenu={handleContextMenu}
						onDoubleClick={() => {
							if (isMarkdown) onOpenInNewTab(note.note_path);
						}}
						onAuxClick={(event) => {
							cancelHoverPrefetch();
							if (isMarkdown && event.button === 1) onOpenInNewTab(note.note_path);
						}}
						{...hoverPrefetchProps}
						onFocus={(event) => {
							if (event.target !== event.currentTarget) return;
							onFocus();
							if (isMarkdown) onPrefetch(note.note_path);
						}}
						title={note.note_path}
						style={rowStyle}
						data-draggable="true"
						data-dragging={isDragging ? "true" : undefined}
					>
						{isMarkdown ? (
							<>
								<span className="folioNoteRowTop">
									<span className="folioNoteTitle">{title}</span>
									{taskProgress}
									{noteTitleIcon}
								</span>
								{rowDetails}
							</>
						) : (
							fileDetails
						)}
					</button>
				)}
			</li>
		);
	}),
);
