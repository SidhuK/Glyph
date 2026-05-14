import {
	type CSSProperties,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { normalizeInlineMarkdown } from "../../lib/markdownUtils";
import type { FileTreeAppearance, NoteTaskSummary } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { basename, parentDir, splitEditableFileName } from "../../utils/path";
import { DatabaseColumnIcon } from "../database/DatabaseColumnIcon";
import { formatDatabaseTagLabel } from "../database/databaseTagLabel";
import {
	getEditorTextColorOption,
	isEditorTextColor,
} from "../editor/textColors";
import { FileTreeAppearanceMenu } from "../filetree/FileTreeAppearanceMenu";
import { getFileTypeInfo } from "../filetree/fileTypeUtils";
import { TaskProgressIndicator } from "../tasks/TaskProgressIndicator";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "../ui/shadcn/context-menu";
import type { FolioItem } from "./useFolioNotes";

interface FolioNoteListItemProps {
	note: FolioItem;
	selected: boolean;
	onOpen: (path: string) => void;
	onOpenInNewTab: (path: string) => void;
	onPrefetch: (path: string) => void;
	onRename?: (path: string) => void;
	onDelete: (path: string) => void;
	onFocus: () => void;
	taskSummary?: NoteTaskSummary | null;
	isRenaming?: boolean;
	onCommitRename: (
		path: string,
		nextName: string,
	) => Promise<boolean> | boolean;
	onCancelRename: () => void;
	appearance?: FileTreeAppearance | null;
	onChangeAppearance: (
		path: string,
		appearance: FileTreeAppearance,
	) => Promise<void> | void;
}

type FolioImageRef =
	| { kind: "markdown-link"; href: string }
	| { kind: "wiki-image-link"; href: string }
	| { kind: "direct"; src: string };

const FOLIO_THUMBNAIL_MAX_BYTES = 4 * 1024 * 1024;
const FOLIO_NOTE_IMAGE_SCAN_MAX_BYTES = 2 * 1024 * 1024;
const IMAGE_EXT_RE = /\.(?:png|jpe?g|webp|gif|svg|bmp|avif|tiff?)(?:[#?].*)?$/i;
const DIRECT_IMAGE_SRC_RE = /^(?:https?:|data:|blob:)/i;

interface FolioImageCandidate {
	index: number;
	ref: FolioImageRef;
}

function titleFromPath(notePath: string): string {
	return basename(notePath).replace(/\.md$/i, "") || "Untitled";
}

function dateLabel(iso: string | null): string {
	if (!iso) return "No date";
	try {
		return new Intl.DateTimeFormat(undefined, {
			month: "short",
			day: "numeric",
		}).format(new Date(iso));
	} catch {
		return "No date";
	}
}

function previewText(preview: string, title: string): string {
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

	return previewLines.join(" ") || "No preview";
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

	for (const match of markdown.matchAll(
		/<img\b[^>]*\bsrc=(["'])(.*?)\1[^>]*>/gi,
	)) {
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

function FolioRenameInput({
	initialName,
	relPath,
	fileStem,
	fileExt,
	onCommitRename,
	onCancelRename,
}: {
	initialName: string;
	relPath: string;
	fileStem: string;
	fileExt: string;
	onCommitRename: (
		path: string,
		nextName: string,
	) => Promise<boolean> | boolean;
	onCancelRename: () => void;
}) {
	const [draftName, setDraftName] = useState(initialName);
	const submittedRef = useRef(false);
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);

	const commitRename = async () => {
		if (submittedRef.current) return;
		submittedRef.current = true;
		const nextStem = draftName.trim() || fileStem || initialName.trim();
		const renamed = await onCommitRename(relPath, `${nextStem}${fileExt}`);
		if (!renamed) {
			submittedRef.current = false;
		}
	};

	return (
		<input
			ref={inputRef}
			className="plainTextInput folioNoteRenameInput"
			value={draftName}
			placeholder="Untitled"
			onChange={(event) => setDraftName(event.target.value)}
			onBlur={() => void commitRename()}
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					void commitRename();
					return;
				}
				if (event.key === "Escape") {
					event.preventDefault();
					submittedRef.current = true;
					onCancelRename();
				}
			}}
		/>
	);
}

export const FolioNoteListItem = memo(function FolioNoteListItem({
	note,
	selected,
	onOpen,
	onOpenInNewTab,
	onPrefetch,
	onRename,
	onDelete,
	onFocus,
	taskSummary = null,
	isRenaming = false,
	onCommitRename,
	onCancelRename,
	appearance = null,
	onChangeAppearance,
}: FolioNoteListItemProps) {
	const title = note.title.trim() || titleFromPath(note.note_path);
	const isMarkdown = note.is_markdown;
	const { stem: fileStem, ext: fileExt } = splitEditableFileName(
		basename(note.note_path),
	);
	const { Icon, color } = getFileTypeInfo(note.note_path, isMarkdown);
	const customColor =
		appearance?.color && isEditorTextColor(appearance.color)
			? appearance.color
			: null;
	const rowStyle = customColor
		? ({
				"--folio-file-color": `var(${getEditorTextColorOption(customColor).cssVar})`,
			} as CSSProperties)
		: undefined;
	const iconColor = customColor ? "var(--folio-file-color)" : color;
	const extBadge = !isMarkdown && fileExt ? fileExt.slice(1) : "";
	const preview = useMemo(() => {
		return previewText(note.preview, title);
	}, [note.preview, title]);
	const updated = isMarkdown ? dateLabel(note.updated) : "";
	const visibleTags = note.tags.slice(0, 2);
	const hiddenTagCount = Math.max(0, note.tags.length - visibleTags.length);
	const folder = parentDir(note.note_path);
	const thumbnailSrc = useFolioThumbnail(note);
	const taskProgress =
		taskSummary && taskSummary.total_count > 0 ? (
			<TaskProgressIndicator
				summary={taskSummary}
				className="folioNoteTaskProgress"
			/>
		) : null;
	const handleRevealInFinder = useCallback(async () => {
		try {
			await invoke("space_reveal_path", { path: note.note_path });
		} catch (error) {
			console.error("Failed to show file in Finder", error);
		}
	}, [note.note_path]);
	const leadingIcon = appearance?.icon ? (
		<DatabaseColumnIcon
			iconName={appearance.icon}
			size={15}
			className="folioNoteFileIcon"
		/>
	) : (
		<Icon
			size={15}
			className="folioNoteFileIcon"
			style={{ color: iconColor }}
			aria-hidden="true"
		/>
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
					{visibleTags.length > 0 ? (
						visibleTags.map((tag) => (
							<span
								key={tag}
								className="databaseCellPill folioNoteTag"
								title={formatDatabaseTagLabel(tag)}
							>
								{formatDatabaseTagLabel(tag)}
							</span>
						))
					) : (
						<span className="folioNoteFolder">{folder || "No folder"}</span>
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
			{leadingIcon}
			<span className="folioFileName">{fileStem || title}</span>
			{extBadge ? <span className="fileTreeExtBadge">{extBadge}</span> : null}
		</span>
	);

	return (
		<li className="folioNoteListItem">
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
						<FolioRenameInput
							key={`${note.note_path}:${fileStem}`}
							initialName={fileStem || titleFromPath(note.note_path)}
							relPath={note.note_path}
							fileStem={fileStem}
							fileExt={fileExt}
							onCommitRename={onCommitRename}
							onCancelRename={onCancelRename}
						/>
						{taskProgress}
					</span>
					{isMarkdown ? rowDetails : fileDetails}
				</div>
			) : (
				<ContextMenu>
					<ContextMenuTrigger asChild>
						<button
							type="button"
							className="folioNoteRow"
							data-state={selected ? "selected" : "idle"}
							data-kind={isMarkdown ? "markdown" : "file"}
							data-folio-note-path={note.note_path}
							aria-current={selected ? "page" : undefined}
							onClick={(event) => {
								if (event.metaKey || event.ctrlKey) {
									onOpenInNewTab(note.note_path);
									return;
								}
								onOpen(note.note_path);
							}}
							onDoubleClick={() => onOpenInNewTab(note.note_path)}
							onAuxClick={(event) => {
								if (event.button === 1) onOpenInNewTab(note.note_path);
							}}
							onMouseEnter={() => {
								if (isMarkdown) onPrefetch(note.note_path);
							}}
							onFocus={() => {
								onFocus();
								if (isMarkdown) onPrefetch(note.note_path);
							}}
							title={note.note_path}
							style={rowStyle}
						>
							{isMarkdown ? (
								<>
									<span className="folioNoteRowTop">
										<span className="folioNoteTitle">{title}</span>
										{taskProgress}
									</span>
									{rowDetails}
								</>
							) : (
								fileDetails
							)}
						</button>
					</ContextMenuTrigger>
					<ContextMenuContent
						className="fileTreeCreateMenu"
						onCloseAutoFocus={(event) => event.preventDefault()}
					>
						<ContextMenuItem
							className="fileTreeCreateMenuItem"
							onSelect={() => onOpen(note.note_path)}
						>
							Open
						</ContextMenuItem>
						<ContextMenuItem
							className="fileTreeCreateMenuItem"
							onSelect={() => onOpenInNewTab(note.note_path)}
						>
							Open in New Tab
						</ContextMenuItem>
						<ContextMenuItem
							className="fileTreeCreateMenuItem"
							onSelect={() => void handleRevealInFinder()}
						>
							Show in Finder
						</ContextMenuItem>
						<ContextMenuSeparator className="fileTreeCreateMenuSeparator" />
						{onRename ? (
							<ContextMenuItem
								className="fileTreeCreateMenuItem"
								onSelect={() => onRename(note.note_path)}
							>
								Rename
							</ContextMenuItem>
						) : null}
						<FileTreeAppearanceMenu
							itemKind="file"
							appearance={appearance}
							onChangeAppearance={(nextAppearance) =>
								onChangeAppearance(note.note_path, nextAppearance)
							}
						/>
						<ContextMenuItem
							variant="destructive"
							className="fileTreeCreateMenuItem"
							onSelect={() => onDelete(note.note_path)}
						>
							Delete
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>
			)}
		</li>
	);
});
