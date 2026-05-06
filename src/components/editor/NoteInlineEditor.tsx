import { openUrl } from "@tauri-apps/plugin-opener";
import {
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { flushSync } from "react-dom";
import {
	EDITOR_MENU_ACTION_EVENT,
	type EditorMenuActionDetail,
} from "../../lib/appEvents";
import { MERMAID_CODE_BLOCK_LANGUAGE } from "../../lib/mermaid";
import { joinYamlFrontmatter } from "../../lib/notePreview";
import { type BacklinkItem, invoke } from "../../lib/tauri";
import { X } from "../Icons";
import { Button } from "../ui/shadcn/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/shadcn/dialog";
import { Input } from "../ui/shadcn/input";
import { ExtractToNoteDialog } from "./ExtractToNoteDialog";
import { NoteEditorSurface } from "./NoteEditorSurface";
import { NoteFindBar } from "./NoteFindBar";
import { NotePropertiesPanel } from "./NotePropertiesPanel";
import {
	type SupportedCodeBlockLanguage,
	getCodeBlockLanguageLabel,
	normalizeCodeBlockLanguage,
} from "./extensions/codeBlockHighlighting";
import {
	getMountedEditorContentRoot,
	getOffsetWithinAncestor,
	isVisibleEditorHost,
} from "./hooks/editorDomUtils";
import { useExtractSelectionToNote } from "./hooks/useExtractSelectionToNote";
import { useNoteEditor } from "./hooks/useNoteEditor";
import { useNoteFind } from "./hooks/useNoteFind";
import { useResetScrollOnChange } from "./hooks/useResetScrollOnChange";
import { useSelectionRibbon } from "./hooks/useSelectionRibbon";
import { useTableInlineControls } from "./hooks/useTableInlineControls";
import { useTaskInlineDates } from "./hooks/useTaskInlineDates";
import {
	dispatchMarkdownLinkClick,
	dispatchWikiLinkClick,
} from "./markdown/editorEvents";
import { parseWikiLink } from "./markdown/wikiLinkCodec";
import type { SelectedCodeBlockState } from "./noteEditorOverlayTypes";
import { isEditorTextColor } from "./textColors";
import { isEditorTextHighlight } from "./textHighlights";
import type { NoteInlineEditorProps } from "./types";

function normalizeBody(markdown: string): string {
	return markdown.replace(/\u00a0/g, " ").replace(/&nbsp;/g, " ");
}

type FrontmatterLinkToken =
	| { kind: "wiki"; raw: string; start: number; end: number }
	| { kind: "href"; raw: string; href: string; start: number; end: number };

const FRONTMATTER_LINK_PATTERN =
	/!?\[\[[^\]\n]+\]\]|\[[^\]\n]+\]\((?:\\.|[^)\n])+\)|https?:\/\/[^\s<>"')\]]+/g;

let lastFocusedNoteEditorHost: HTMLDivElement | null = null;

interface LinkDialogState {
	href: string;
	target: "_self" | "_blank";
}

function areSelectedCodeBlocksEqual(
	a: SelectedCodeBlockState | null,
	b: SelectedCodeBlockState | null,
): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	return (
		a.top === b.top &&
		a.controlsLeft === b.controlsLeft &&
		a.controlsRight === b.controlsRight &&
		a.previewLeft === b.previewLeft &&
		a.width === b.width &&
		a.previewTop === b.previewTop &&
		a.pos === b.pos &&
		a.language === b.language &&
		a.source === b.source
	);
}

function areSelectedCodeBlocksSameBlock(
	a: SelectedCodeBlockState | null,
	b: SelectedCodeBlockState | null,
): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	return a.pos === b.pos && a.language === b.language && a.source === b.source;
}

function markdownHrefFromToken(raw: string): string | null {
	const match = raw.match(/^\[[^\]\n]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
	return match?.[1] ?? null;
}

function extractFrontmatterLinkTokens(text: string): FrontmatterLinkToken[] {
	const tokens: FrontmatterLinkToken[] = [];
	for (const match of text.matchAll(FRONTMATTER_LINK_PATTERN)) {
		if (match.index === undefined) continue;
		const raw = match[0];
		const start = match.index;
		const end = start + raw.length;
		if (raw.includes("[[")) {
			if (parseWikiLink(raw)) tokens.push({ kind: "wiki", raw, start, end });
			continue;
		}
		if (raw.startsWith("[")) {
			const href = markdownHrefFromToken(raw);
			if (href) tokens.push({ kind: "href", raw, href, start, end });
			continue;
		}
		tokens.push({ kind: "href", raw, href: raw, start, end });
	}
	return tokens;
}

function normalizeEditorHref(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (
		trimmed.startsWith("http://") ||
		trimmed.startsWith("https://") ||
		trimmed.startsWith("mailto:") ||
		trimmed.startsWith("tel:") ||
		trimmed.startsWith("#") ||
		trimmed.startsWith("/")
	) {
		return trimmed;
	}
	return `https://${trimmed}`;
}

async function openFrontmatterHref(
	href: string,
	sourcePath: string,
): Promise<void> {
	if (href.startsWith("http://") || href.startsWith("https://")) {
		await openUrl(href);
		return;
	}
	if (href.startsWith("#")) return;
	dispatchMarkdownLinkClick({ href, sourcePath });
}

export const NoteInlineEditor = memo(function NoteInlineEditor({
	markdown,
	relPath,
	mode,
	zenModeActive = false,
	interactive = true,
	showBacklinks = true,
	deferHeavyFeatures = false,
	pasteMarkdownBehavior = "plain-text",
	onRegisterCalloutInserter,
	onEditorReady,
	onChange,
	onFrontmatterCommit,
	extractToNoteActions,
}: NoteInlineEditorProps) {
	const {
		editor,
		frontmatter,
		frontmatterRef,
		lastAppliedBodyRef,
		lastEmittedMarkdownRef,
		colorfulHeadings,
		showFrontmatterInEditor,
	} = useNoteEditor({
		markdown,
		mode,
		zenModeActive,
		relPath,
		interactive,
		enableHydrateInlineImages: !deferHeavyFeatures,
		enableMarkdownLinkAutocomplete: !deferHeavyFeatures,
		pasteMarkdownBehavior,
		onChange,
	});

	const [frontmatterDraft, setFrontmatterDraft] = useState(frontmatter ?? "");
	const lastFrontmatterRef = useRef(frontmatter);
	const [backlinks, setBacklinks] = useState<BacklinkItem[]>([]);
	const tiptapHostRef = useRef<HTMLDivElement | null>(null);
	const [tiptapHostNode, setTiptapHostNode] = useState<HTMLDivElement | null>(
		null,
	);
	const [editorFocused, setEditorFocused] = useState(false);
	const [codeBlockPickerOpen, setCodeBlockPickerOpen] = useState(false);
	const [selectedCodeBlock, setSelectedCodeBlock] =
		useState<SelectedCodeBlockState | null>(null);
	const selectedCodeBlockRef = useRef<SelectedCodeBlockState | null>(null);
	const codeBlockCopyResetTimerRef = useRef<number | null>(null);
	const [codeBlockCopied, setCodeBlockCopied] = useState(false);
	const [activeMermaidPreviewPos, setActiveMermaidPreviewPos] = useState<
		number | null
	>(null);
	const [activeMermaidPreviewHeight, setActiveMermaidPreviewHeight] =
		useState(0);
	const [linkDialog, setLinkDialog] = useState<LinkDialogState | null>(null);
	const rawTextareaRef = useRef<HTMLTextAreaElement | null>(null);
	const previousRelPathRef = useRef(relPath);

	useEffect(() => {
		onEditorReady?.(editor ?? null);
		return () => onEditorReady?.(null);
	}, [editor, onEditorReady]);

	useEffect(() => {
		const host = tiptapHostRef.current;
		const blurHostSelection = (host: HTMLDivElement | null) => {
			if (!host) return;
			const activeElement = document.activeElement;
			if (
				activeElement instanceof HTMLElement &&
				host.contains(activeElement)
			) {
				activeElement.blur();
			}
			const selection = window.getSelection();
			if (selection?.anchorNode && host.contains(selection.anchorNode)) {
				selection.removeAllRanges();
			}
		};
		if (previousRelPathRef.current !== relPath) {
			blurHostSelection(host);
			previousRelPathRef.current = relPath;
		}
		return () => {
			blurHostSelection(host);
		};
	}, [relPath]);

	useEffect(() => {
		if (frontmatter === lastFrontmatterRef.current) return;
		lastFrontmatterRef.current = frontmatter;
		setFrontmatterDraft(frontmatter ?? "");
	}, [frontmatter]);

	// Reset when the editor context changes, but not on every content update.
	// Including `markdown` here causes the viewport to jump to the top while typing.
	useResetScrollOnChange(tiptapHostRef, ".rfNodeNoteEditorBody", [
		mode,
		relPath,
	]);

	useEffect(() => {
		if (!relPath || !showBacklinks || deferHeavyFeatures) {
			setBacklinks([]);
			return;
		}
		let cancelled = false;
		void (async () => {
			try {
				const items = await invoke("backlinks", { note_id: relPath });
				if (!cancelled) setBacklinks(items);
			} catch {
				if (!cancelled) setBacklinks([]);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [deferHeavyFeatures, relPath, showBacklinks]);

	const canEdit = mode === "rich" && Boolean(editor?.isEditable);
	const selectionRibbon = useSelectionRibbon({
		canEdit,
		editor,
		hostRef: tiptapHostRef,
		mode,
	});
	const selectedTable = useTableInlineControls({
		canEdit,
		editor,
		hostRef: tiptapHostRef,
		mode,
	});
	const taskInlineDates = useTaskInlineDates({
		deferHeavyFeatures,
		editor,
		hostRef: tiptapHostRef,
		markdown,
		mode,
		onChange,
	});
	const extractToNote = useExtractSelectionToNote({
		actions: extractToNoteActions,
		canEdit,
		editor,
		hostRef: tiptapHostRef,
		relPath,
	});
	const noteFind = useNoteFind({
		editor,
		markdown,
		mode,
		relPath,
		rawTextareaRef,
		tiptapHostRef,
	});

	useEffect(() => {
		if (!editor || mode !== "rich") return;

		const runEditorAction = (action: string) => {
			const host = tiptapHostRef.current;
			if (!host || !isVisibleEditorHost(host)) return;
			const activeElement = document.activeElement;
			if (activeElement instanceof HTMLElement) {
				if (host.contains(activeElement)) {
					lastFocusedNoteEditorHost = host;
				} else if (lastFocusedNoteEditorHost !== host) {
					return;
				}
			} else if (lastFocusedNoteEditorHost !== host) {
				return;
			}
			const scrollHost = host.closest(
				".rfNodeNoteEditorBody",
			) as HTMLElement | null;
			const scrollTop = scrollHost?.scrollTop ?? 0;
			const isReadOnlySafeAction =
				action === "collapse_all_headings" || action === "expand_all_headings";
			if (!canEdit && !isReadOnlySafeAction) return;
			const chain = editor
				.chain()
				.focus(null, { scrollIntoView: false })
				.extendMarkRange("link");
			const handled = (() => {
				switch (action) {
					case "bold":
						return chain.toggleBold().run();
					case "italic":
						return chain.toggleItalic().run();
					case "underline":
						return chain.toggleUnderline().run();
					case "strikethrough":
						return chain.toggleStrike().run();
					case "heading_1":
						return chain.toggleHeading({ level: 1 }).run();
					case "heading_2":
						return chain.toggleHeading({ level: 2 }).run();
					case "heading_3":
						return chain.toggleHeading({ level: 3 }).run();
					case "collapse_all_headings":
						return chain.collapseAllHeadings().run();
					case "expand_all_headings":
						return chain.expandAllHeadings().run();
					case "bullet_list":
						return chain.toggleBulletList().run();
					case "numbered_list":
						return chain.toggleOrderedList().run();
					case "todo_list":
						return chain.toggleTaskList().run();
					case "quote":
						return chain.toggleBlockquote().run();
					case "code_block":
						return chain.toggleCodeBlock().run();
					case "mermaid_chart":
						return chain
							.insertContent({
								type: "codeBlock",
								attrs: { language: "mermaid" },
								content: [
									{
										type: "text",
										text: "flowchart TD\n  A[Start] --> B[End]",
									},
								],
							})
							.run();
					case "table":
						return chain
							.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
							.run();
					case "divider":
						return chain.setHorizontalRule().run();
					case "extract_selection_to_note":
						extractToNote.openExtractDialog();
						return true;
					case "callout_info":
						return chain
							.insertContent({
								type: "blockquote",
								content: [
									{
										type: "paragraph",
										content: [{ type: "text", text: "[!info]" }],
									},
									{ type: "paragraph" },
								],
							})
							.run();
					case "callout_warning":
						return chain
							.insertContent({
								type: "blockquote",
								content: [
									{
										type: "paragraph",
										content: [{ type: "text", text: "[!warning]" }],
									},
									{ type: "paragraph" },
								],
							})
							.run();
					case "callout_error":
						return chain
							.insertContent({
								type: "blockquote",
								content: [
									{
										type: "paragraph",
										content: [{ type: "text", text: "[!error]" }],
									},
									{ type: "paragraph" },
								],
							})
							.run();
					case "callout_success":
						return chain
							.insertContent({
								type: "blockquote",
								content: [
									{
										type: "paragraph",
										content: [{ type: "text", text: "[!success]" }],
									},
									{ type: "paragraph" },
								],
							})
							.run();
					case "callout_tip":
						return chain
							.insertContent({
								type: "blockquote",
								content: [
									{
										type: "paragraph",
										content: [{ type: "text", text: "[!tip]" }],
									},
									{ type: "paragraph" },
								],
							})
							.run();
					case "link_set": {
						const linkAttrs = editor.getAttributes("link") as {
							href?: string;
							target?: string;
						};
						setLinkDialog({
							href: linkAttrs.href ?? "",
							target: linkAttrs.target === "_blank" ? "_blank" : "_self",
						});
						return true;
					}
					case "link_clear":
						return chain.unsetLink().run();
					case "color_clear":
						return chain.unsetTextColor().run();
					case "highlight_clear":
						return chain.unsetTextHighlight().run();
					default: {
						if (action.startsWith("color_")) {
							const color = action.slice("color_".length);
							if (isEditorTextColor(color)) {
								return chain.setTextColor(color).run();
							}
							return false;
						}
						if (action.startsWith("highlight_")) {
							const highlight = action.slice("highlight_".length);
							if (isEditorTextHighlight(highlight)) {
								return chain.setTextHighlight(highlight).run();
							}
							return false;
						}
						return false;
					}
				}
			})();
			if (!handled) return;
			if (scrollHost) {
				requestAnimationFrame(() => {
					scrollHost.scrollTop = scrollTop;
				});
			}
		};

		const onEditorMenuAction = (event: Event) => {
			const detail =
				event instanceof CustomEvent
					? (event.detail as EditorMenuActionDetail | null)
					: null;
			if (!detail?.action) return;
			runEditorAction(detail.action);
		};

		window.addEventListener(EDITOR_MENU_ACTION_EVENT, onEditorMenuAction);
		return () => {
			window.removeEventListener(EDITOR_MENU_ACTION_EVENT, onEditorMenuAction);
		};
	}, [canEdit, editor, extractToNote.openExtractDialog, mode]);

	useEffect(() => {
		if (!onRegisterCalloutInserter) return;
		if (!editor || mode !== "rich") {
			onRegisterCalloutInserter(null);
			return;
		}
		onRegisterCalloutInserter((type: string) => {
			const normalizedType =
				type.toLowerCase() === "warn" ? "warning" : type.toLowerCase();
			const host = tiptapHostRef.current?.closest(
				".rfNodeNoteEditorBody",
			) as HTMLElement | null;
			const scrollTop = host?.scrollTop ?? 0;
			editor
				.chain()
				.focus(null, { scrollIntoView: false })
				.insertContent({
					type: "blockquote",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: `[!${normalizedType}]` }],
						},
						{ type: "paragraph" },
					],
				})
				.run();
			if (host) {
				requestAnimationFrame(() => {
					host.scrollTop = scrollTop;
				});
			}
		});
		return () => onRegisterCalloutInserter(null);
	}, [editor, mode, onRegisterCalloutInserter]);

	const handleFrontmatterChange = (next: string | null) => {
		const normalizedFrontmatter = next?.trim().length ? next : null;
		setFrontmatterDraft(normalizedFrontmatter ?? "");
		frontmatterRef.current = normalizedFrontmatter;
		const currentBody = normalizeBody(
			editor?.getMarkdown() ?? lastAppliedBodyRef.current ?? "",
		);
		const nextMarkdown = joinYamlFrontmatter(
			normalizedFrontmatter,
			currentBody,
		);
		if (nextMarkdown === lastEmittedMarkdownRef.current) return;
		lastEmittedMarkdownRef.current = nextMarkdown;
		onChange(nextMarkdown);
		onFrontmatterCommit?.();
	};

	const renderFrontmatterWithLinks = (text: string) => {
		const tokens = extractFrontmatterLinkTokens(text);
		if (!tokens.length) return text;
		const nodes: ReactNode[] = [];
		let cursor = 0;
		for (const token of tokens) {
			if (cursor < token.start) nodes.push(text.slice(cursor, token.start));
			if (token.kind === "wiki") {
				const parsed = parseWikiLink(token.raw);
				nodes.push(
					interactive && parsed ? (
						<button
							key={`fm-${token.start}-${token.end}`}
							type="button"
							className="frontmatterInlineLink"
							onClick={() => {
								dispatchWikiLinkClick({
									raw: parsed.raw,
									target: parsed.target,
									alias: parsed.alias,
									anchorKind: parsed.anchorKind,
									anchor: parsed.anchor,
									unresolved: parsed.unresolved,
									embed: parsed.embed,
								});
							}}
						>
							{token.raw}
						</button>
					) : (
						token.raw
					),
				);
			} else {
				nodes.push(
					interactive ? (
						<button
							key={`fm-${token.start}-${token.end}`}
							type="button"
							className="frontmatterInlineLink"
							onClick={() => {
								void openFrontmatterHref(token.href, relPath ?? "");
							}}
						>
							{token.raw}
						</button>
					) : (
						token.raw
					),
				);
			}
			cursor = token.end;
		}
		if (cursor < text.length) nodes.push(text.slice(cursor));
		return nodes;
	};

	useEffect(() => {
		if (!editor || mode !== "rich") {
			selectedCodeBlockRef.current = null;
			if (codeBlockCopyResetTimerRef.current !== null) {
				window.clearTimeout(codeBlockCopyResetTimerRef.current);
				codeBlockCopyResetTimerRef.current = null;
			}
			setSelectedCodeBlock(null);
			setCodeBlockPickerOpen(false);
			setCodeBlockCopied(false);
			return;
		}
		const host = tiptapHostRef.current;
		const contentRoot = getMountedEditorContentRoot(host);
		if (!host || !contentRoot) return;

		const clearSelectedCodeBlock = () => {
			selectedCodeBlockRef.current = null;
			if (codeBlockCopyResetTimerRef.current !== null) {
				window.clearTimeout(codeBlockCopyResetTimerRef.current);
				codeBlockCopyResetTimerRef.current = null;
			}
			setSelectedCodeBlock(null);
			setCodeBlockPickerOpen(false);
			setCodeBlockCopied(false);
		};

		const syncSelectedCodeBlock = () => {
			const selection = window.getSelection();
			if (!selection?.anchorNode) {
				clearSelectedCodeBlock();
				return;
			}
			const anchorElement =
				selection.anchorNode instanceof HTMLElement
					? selection.anchorNode
					: selection.anchorNode.parentElement;
			if (!anchorElement || !host.contains(anchorElement)) {
				clearSelectedCodeBlock();
				return;
			}

			const codeElement = anchorElement.closest("pre") as HTMLElement | null;
			if (!codeElement || !host.contains(codeElement)) {
				clearSelectedCodeBlock();
				return;
			}

			const parentNode = editor.state.selection.$from.parent;
			if (parentNode.type.name !== "codeBlock") {
				clearSelectedCodeBlock();
				return;
			}

			const codeOffset = getOffsetWithinAncestor(codeElement, host);
			const nextTop = codeOffset.top + 8;
			const nextControlsLeft = codeOffset.left + 10;
			const nextControlsRight = codeOffset.left + codeElement.offsetWidth - 10;
			const nextPreviewLeft = codeOffset.left;
			const nextWidth = Math.max(220, codeElement.offsetWidth);
			const nextPreviewTop = codeOffset.top + codeElement.offsetHeight + 12;
			const nextLanguage =
				typeof parentNode.attrs.language === "string"
					? parentNode.attrs.language
					: null;
			const nextPos = editor.state.selection.$from.before();
			const nextSource = parentNode.textContent ?? "";

			const nextCodeBlock = {
				top: nextTop,
				controlsLeft: nextControlsLeft,
				controlsRight: nextControlsRight,
				previewLeft: nextPreviewLeft,
				width: nextWidth,
				previewTop: nextPreviewTop,
				pos: nextPos,
				language: nextLanguage,
				source: nextSource,
			} satisfies SelectedCodeBlockState;
			if (
				!areSelectedCodeBlocksSameBlock(
					selectedCodeBlockRef.current,
					nextCodeBlock,
				)
			) {
				selectedCodeBlockRef.current = nextCodeBlock;
				if (codeBlockCopyResetTimerRef.current !== null) {
					window.clearTimeout(codeBlockCopyResetTimerRef.current);
					codeBlockCopyResetTimerRef.current = null;
				}
				setCodeBlockCopied(false);
			}
			setSelectedCodeBlock((prev) => {
				if (areSelectedCodeBlocksEqual(prev, nextCodeBlock)) return prev;
				return nextCodeBlock;
			});
		};

		syncSelectedCodeBlock();
		const scrollHost = host.closest(".rfNodeNoteEditorBody");
		scrollHost?.addEventListener("scroll", syncSelectedCodeBlock, {
			passive: true,
		});
		window.addEventListener("resize", syncSelectedCodeBlock);
		document.addEventListener("selectionchange", syncSelectedCodeBlock);
		editor.on("selectionUpdate", syncSelectedCodeBlock);
		editor.on("transaction", syncSelectedCodeBlock);
		return () => {
			if (codeBlockCopyResetTimerRef.current !== null) {
				window.clearTimeout(codeBlockCopyResetTimerRef.current);
				codeBlockCopyResetTimerRef.current = null;
			}
			scrollHost?.removeEventListener("scroll", syncSelectedCodeBlock);
			window.removeEventListener("resize", syncSelectedCodeBlock);
			document.removeEventListener("selectionchange", syncSelectedCodeBlock);
			editor.off("selectionUpdate", syncSelectedCodeBlock);
			editor.off("transaction", syncSelectedCodeBlock);
		};
	}, [editor, mode]);

	const selectedCodeBlockLanguage = useMemo(
		() => normalizeCodeBlockLanguage(selectedCodeBlock?.language),
		[selectedCodeBlock?.language],
	);
	const selectedCodeBlockLanguageLabel = getCodeBlockLanguageLabel(
		selectedCodeBlock?.language,
	);
	const isSelectedMermaidCodeBlock =
		selectedCodeBlockLanguage === MERMAID_CODE_BLOCK_LANGUAGE;
	const isSelectedMermaidPreviewActive =
		isSelectedMermaidCodeBlock &&
		selectedCodeBlock?.pos === activeMermaidPreviewPos;

	const applyCodeBlockLanguage = (language: SupportedCodeBlockLanguage) => {
		if (!editor) return;
		editor
			.chain()
			.focus(null, { scrollIntoView: false })
			.updateAttributes("codeBlock", {
				language: language === "plaintext" ? null : language,
			})
			.run();
		if (language !== MERMAID_CODE_BLOCK_LANGUAGE) {
			setActiveMermaidPreviewPos(null);
		}
		setCodeBlockPickerOpen(false);
	};
	const preventCodeBlockPickerMouseDown = (
		event: ReactMouseEvent<HTMLElement>,
	) => {
		event.preventDefault();
	};
	const preventTableControlMouseDown = (
		event: ReactMouseEvent<HTMLButtonElement>,
	) => {
		event.preventDefault();
	};
	const addRowToSelectedTable = () => {
		if (!editor) return;
		editor.chain().focus(null, { scrollIntoView: false }).addRowAfter().run();
	};
	const addColumnToSelectedTable = () => {
		if (!editor) return;
		editor
			.chain()
			.focus(null, { scrollIntoView: false })
			.addColumnAfter()
			.run();
	};
	const handleEditorPointerDownCapture = (
		event: React.PointerEvent<HTMLDivElement>,
	) => {
		if (!canEdit || activeMermaidPreviewPos === null) return;
		const target = event.target instanceof HTMLElement ? event.target : null;
		if (
			target?.closest(".codeBlockPreviewBtn") ||
			target?.closest(".codeBlockCopyBtn") ||
			target?.closest(".codeBlockLanguageBtn") ||
			target?.closest(".codeBlockLanguagePopover")
		) {
			return;
		}
		flushSync(() => {
			setActiveMermaidPreviewPos(null);
			setActiveMermaidPreviewHeight(0);
		});
	};
	const toggleSelectedMermaidPreview = () => {
		if (!selectedCodeBlock || !isSelectedMermaidCodeBlock) return;
		setActiveMermaidPreviewPos((prev) =>
			prev === selectedCodeBlock.pos ? null : selectedCodeBlock.pos,
		);
	};

	useEffect(() => {
		if (!editor) return;
		editor.commands.setActiveMermaidPreview(
			isSelectedMermaidPreviewActive ? activeMermaidPreviewPos : null,
		);
	}, [activeMermaidPreviewPos, editor, isSelectedMermaidPreviewActive]);

	useEffect(() => {
		if (!editor) return;
		editor.commands.setRichMermaidPreviewHeight(
			isSelectedMermaidPreviewActive ? activeMermaidPreviewHeight : 0,
		);
	}, [activeMermaidPreviewHeight, editor, isSelectedMermaidPreviewActive]);

	useEffect(() => {
		if (!editor) return;
		if (mode === "preview") {
			editor.commands.refreshMermaidPreviews();
		}
	}, [editor, mode]);

	useEffect(() => {
		if (!editor) return;
		const root = document.documentElement;
		const refresh = () => {
			if (mode === "preview") {
				editor.commands.refreshMermaidPreviews();
			}
		};
		const observer = new MutationObserver(refresh);
		observer.observe(root, {
			attributes: true,
			attributeFilter: ["class", "data-theme"],
		});
		return () => observer.disconnect();
	}, [editor, mode]);

	useEffect(() => {
		const host = tiptapHostNode;
		if (!host) return;
		const handleFocusIn = () => {
			lastFocusedNoteEditorHost = host;
			setEditorFocused(true);
		};
		const handleFocusOut = () => {
			window.setTimeout(() => {
				setEditorFocused(host.contains(document.activeElement));
			}, 0);
		};
		handleFocusOut();
		host.addEventListener("focusin", handleFocusIn);
		host.addEventListener("focusout", handleFocusOut);
		return () => {
			host.removeEventListener("focusin", handleFocusIn);
			host.removeEventListener("focusout", handleFocusOut);
			if (lastFocusedNoteEditorHost === host) {
				lastFocusedNoteEditorHost = null;
			}
		};
	}, [tiptapHostNode]);

	const handleTiptapHostRef = useCallback((node: HTMLDivElement | null) => {
		tiptapHostRef.current = node;
		setTiptapHostNode(node);
	}, []);

	const closeLinkDialog = useCallback(() => {
		setLinkDialog(null);
	}, []);

	const applyLinkDialog = useCallback(() => {
		if (!editor || !canEdit || !linkDialog) return;
		const href = normalizeEditorHref(linkDialog.href);
		const chain = editor
			.chain()
			.focus(null, { scrollIntoView: false })
			.extendMarkRange("link");
		if (!href) {
			chain.unsetLink().run();
			setLinkDialog(null);
			return;
		}
		chain
			.setLink({
				href,
				target: linkDialog.target,
				rel: linkDialog.target === "_blank" ? "noopener noreferrer" : undefined,
			})
			.run();
		setLinkDialog(null);
	}, [canEdit, editor, linkDialog]);

	const removeLinkFromDialog = useCallback(() => {
		if (!editor || !canEdit) return;
		editor
			.chain()
			.focus(null, { scrollIntoView: false })
			.extendMarkRange("link")
			.unsetLink()
			.run();
		setLinkDialog(null);
	}, [canEdit, editor]);

	return (
		<div
			className={[
				"rfNodeNoteEditor",
				"rfNodeNoteEditorFlatEdges",
				"nodrag",
				"nopan",
			]
				.filter(Boolean)
				.join(" ")}
			onKeyDownCapture={noteFind.handleEditorKeyDownCapture}
		>
			<div className="rfNodeNoteEditorBody nodrag nopan nowheel">
				{noteFind.findOpen ? (
					<NoteFindBar
						countLabel={noteFind.findCountLabel}
						inputRef={noteFind.findInputRef}
						matchCount={noteFind.findMatchCount}
						query={noteFind.findQuery}
						onClose={noteFind.closeFind}
						onInputKeyDown={noteFind.handleFindInputKeyDown}
						onNext={() => noteFind.moveFindMatch(1)}
						onPrevious={() => noteFind.moveFindMatch(-1)}
						onQueryChange={noteFind.updateFindQuery}
					/>
				) : null}
				{mode === "plain" ? (
					<textarea
						ref={rawTextareaRef}
						className="rfNodeNoteEditorRaw mono"
						value={markdown}
						onChange={(event) => onChange(event.target.value)}
						spellCheck={false}
					/>
				) : null}
				{mode === "rich" &&
				showFrontmatterInEditor &&
				frontmatterDraft &&
				!zenModeActive ? (
					<div className="frontmatterPreview mono">
						<NotePropertiesPanel
							frontmatter={frontmatterDraft}
							onChange={handleFrontmatterChange}
						/>
					</div>
				) : mode === "rich" &&
					showFrontmatterInEditor &&
					frontmatter &&
					!zenModeActive ? (
					<div className="frontmatterPreview mono">
						<pre>{renderFrontmatterWithLinks(frontmatter.trimEnd())}</pre>
					</div>
				) : null}
				{mode !== "plain" ? (
					<NoteEditorSurface
						editor={editor}
						mode={mode}
						zenModeActive={zenModeActive}
						editorFocused={editorFocused}
						colorfulHeadings={colorfulHeadings}
						canEdit={canEdit}
						hostRef={handleTiptapHostRef}
						onPointerDownCapture={handleEditorPointerDownCapture}
						selectionRibbon={selectionRibbon}
						onExtractSelectionToNote={
							extractToNote.canExtractToNote
								? extractToNote.openExtractDialog
								: undefined
						}
						table={{
							selected: selectedTable,
							onControlMouseDown: preventTableControlMouseDown,
							onAddRow: addRowToSelectedTable,
							onAddColumn: addColumnToSelectedTable,
						}}
						codeBlock={{
							selected: selectedCodeBlock,
							pickerOpen: codeBlockPickerOpen,
							onPickerOpenChange: setCodeBlockPickerOpen,
							language: selectedCodeBlockLanguage,
							languageLabel: selectedCodeBlockLanguageLabel,
							isMermaid: isSelectedMermaidCodeBlock,
							isMermaidPreviewActive: isSelectedMermaidPreviewActive,
							copied: codeBlockCopied,
							onPickerMouseDown: preventCodeBlockPickerMouseDown,
							onApplyLanguage: applyCodeBlockLanguage,
							onToggleMermaidPreview: toggleSelectedMermaidPreview,
							onCopy: () => {
								if (!selectedCodeBlock) return;
								const clipboard = navigator.clipboard;
								if (!clipboard?.writeText) {
									console.error("Clipboard API unavailable");
									setCodeBlockCopied(false);
									return;
								}
								void clipboard
									.writeText(selectedCodeBlock.source)
									.then(() => {
										if (codeBlockCopyResetTimerRef.current !== null) {
											window.clearTimeout(codeBlockCopyResetTimerRef.current);
										}
										setCodeBlockCopied(true);
										codeBlockCopyResetTimerRef.current = window.setTimeout(
											() => {
												codeBlockCopyResetTimerRef.current = null;
												setCodeBlockCopied(false);
											},
											1500,
										);
									})
									.catch((error: unknown) => {
										console.error("Failed to copy code block contents.", error);
										setCodeBlockCopied(false);
									});
							},
							mermaidPreviewHeight: activeMermaidPreviewHeight,
							onMermaidHeightChange: setActiveMermaidPreviewHeight,
						}}
						task={{
							selectedAnchor: taskInlineDates.selectedTaskAnchor,
							scheduleAnchor: taskInlineDates.scheduleAnchor,
							onScheduleAnchorChange: taskInlineDates.setScheduleAnchor,
							onOpenPopover: taskInlineDates.openTaskPopover,
							scheduledDate: taskInlineDates.scheduledDate,
							dueDate: taskInlineDates.dueDate,
							onScheduledDateChange: taskInlineDates.setScheduledDate,
							onDueDateChange: taskInlineDates.setDueDate,
							onResetDraftDates: () => {
								void taskInlineDates.resetDraftDates();
							},
							onUpdateDates: (scheduled, due) => {
								void taskInlineDates.updateTaskDates(scheduled, due);
							},
						}}
						backlinks={{
							show: showBacklinks,
							items: backlinks,
							interactive,
						}}
					/>
				) : null}
			</div>
			<ExtractToNoteDialog
				state={extractToNote.dialogState}
				onClose={extractToNote.closeExtractDialog}
				onSubmit={extractToNote.submitExtractDialog}
				onTitleChange={extractToNote.setExtractTitle}
				onDestinationDirChange={extractToNote.setExtractDestinationDir}
			/>
			<Dialog
				open={linkDialog !== null}
				onOpenChange={(open) => {
					if (!open) closeLinkDialog();
				}}
			>
				<DialogContent
					className="editorLinkDialog"
					onOpenAutoFocus={(event) => {
						const input = document.querySelector<HTMLInputElement>(
							".editorLinkDialogInput",
						);
						if (!input) return;
						event.preventDefault();
						input.focus();
						input.select();
					}}
				>
					<DialogHeader>
						<DialogTitle>Link</DialogTitle>
						<DialogDescription>
							Paste a URL, or leave it blank to remove the link.
						</DialogDescription>
					</DialogHeader>
					<form
						className="editorLinkDialogForm"
						onSubmit={(event) => {
							event.preventDefault();
							applyLinkDialog();
						}}
					>
						<Input
							className="editorLinkDialogInput"
							value={linkDialog?.href ?? ""}
							onChange={(event) =>
								setLinkDialog((current) =>
									current ? { ...current, href: event.target.value } : current,
								)
							}
							placeholder="https://example.com"
							aria-label="Link URL"
						/>
						<label className="editorLinkDialogCheckbox">
							<input
								type="checkbox"
								checked={linkDialog?.target === "_blank"}
								onChange={(event) =>
									setLinkDialog((current) =>
										current
											? {
													...current,
													target: event.target.checked ? "_blank" : "_self",
												}
											: current,
									)
								}
							/>
							<span>Open in new tab</span>
						</label>
						<DialogFooter className="editorLinkDialogActions">
							<Button
								type="button"
								variant="ghost"
								onClick={removeLinkFromDialog}
							>
								<X size={14} />
								Remove
							</Button>
							<Button type="submit">Apply</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
});
