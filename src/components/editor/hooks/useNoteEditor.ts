import { openUrl } from "@tauri-apps/plugin-opener";
import type { JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";
import { useState } from "react";
import {
	joinYamlFrontmatter,
	splitYamlFrontmatter,
} from "../../../lib/notePreview";
import {
	type AttachmentStorageMode,
	loadSettings,
} from "../../../lib/settings";
import { invoke } from "../../../lib/tauri";
import { useTauriEvent } from "../../../lib/tauriEvents";
import { parentDir } from "../../../utils/path";
import { createEditorExtensions } from "../extensions";
import {
	dispatchMarkdownLinkClick,
	dispatchPersonClick,
	dispatchTagClick,
	dispatchWikiLinkClick,
} from "../markdown/editorEvents";
import { looksLikeMarkdownPaste } from "../markdown/markdownPaste";
import {
	postprocessMarkdownFromEditor,
	preprocessMarkdownForEditor,
} from "../markdown/wikiLinkMarkdownBridge";
import type { NoteInlineEditorMode, PasteMarkdownBehavior } from "../types";
import { useHydrateInlineImages } from "./useHydrateInlineImages";

const PASTE_FAILURE_PREFIX = "Image paste failed";
const DEFAULT_ATTACHMENT_FOLDER = "assets";

function normalizeBody(markdown: string): string {
	return markdown.replace(/\u00a0/g, " ").replace(/&nbsp;/g, " ");
}

function getClipboardHtml(event: ClipboardEvent): string {
	return event.clipboardData?.getData("text/html") ?? "";
}

function getClipboardPlainText(event: ClipboardEvent): string {
	return event.clipboardData?.getData("text/plain") ?? "";
}

function resolveAttachmentTargetDir(
	mode: AttachmentStorageMode,
	attachmentFolder: string | null,
	notePath: string,
): string {
	switch (mode) {
		case "space-root":
			return "";
		case "specific-folder":
			return attachmentFolder?.trim() || DEFAULT_ATTACHMENT_FOLDER;
		case "note-folder":
			return parentDir(notePath);
		default:
			return parentDir(notePath);
	}
}

function normalizeClipboardMarkdownText(text: string): string {
	return normalizeBody(text).replace(/\r\n?/g, "\n");
}

const HTML_BLOCK_TAGS = new Set([
	"ADDRESS",
	"ARTICLE",
	"ASIDE",
	"BLOCKQUOTE",
	"DIV",
	"DL",
	"FIELDSET",
	"FIGCAPTION",
	"FIGURE",
	"FOOTER",
	"FORM",
	"H1",
	"H2",
	"H3",
	"H4",
	"H5",
	"H6",
	"HEADER",
	"HR",
	"LI",
	"MAIN",
	"NAV",
	"OL",
	"P",
	"PRE",
	"SECTION",
	"TABLE",
	"TD",
	"TH",
	"TR",
	"UL",
]);

function extractPlainTextFromClipboardHtml(html: string): string {
	if (!html.trim() || typeof DOMParser === "undefined") return "";
	const doc = new DOMParser().parseFromString(html, "text/html");
	const body = doc.body;
	if (!body) return "";

	let out = "";
	const appendNewline = () => {
		if (!out.endsWith("\n")) out += "\n";
	};

	const visit = (node: Node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			out += node.textContent ?? "";
			return;
		}
		if (!(node instanceof Element)) return;
		if (node.tagName === "BR") {
			appendNewline();
			return;
		}
		const isBlock = HTML_BLOCK_TAGS.has(node.tagName);
		if (isBlock && out && !out.endsWith("\n")) appendNewline();
		for (const child of Array.from(node.childNodes)) {
			visit(child);
		}
		if (isBlock) appendNewline();
	};

	for (const child of Array.from(body.childNodes)) {
		visit(child);
	}

	return normalizeClipboardMarkdownText(out).trim();
}

function getPastedImageFiles(event: ClipboardEvent): File[] {
	const files: File[] = [];
	for (const item of Array.from(event.clipboardData?.items ?? [])) {
		if (!item.type.startsWith("image/")) continue;
		const file = item.getAsFile();
		if (file) files.push(file);
	}
	return files;
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === "string") {
				resolve(reader.result);
				return;
			}
			reject(new Error("Failed to read pasted image."));
		};
		reader.onerror = () => {
			reject(reader.error ?? new Error("Failed to read pasted image."));
		};
		reader.readAsDataURL(file);
	});
}

function replacePlaceholderWithImage(
	editor: NonNullable<ReturnType<typeof useEditor>>,
	uploadId: string,
	nextAttrs: Record<string, unknown>,
): boolean {
	const tr = editor.state.tr;
	let changed = false;
	editor.state.doc.descendants((node, pos) => {
		if (node.type.name !== "image") return;
		if ((node.attrs.uploadId as string | null) !== uploadId) return;
		tr.setNodeMarkup(pos, undefined, {
			...node.attrs,
			...nextAttrs,
			uploadId: null,
		});
		changed = true;
	});
	if (!changed) return false;
	editor.view.dispatch(tr);
	return true;
}

function replacePlaceholderWithFallbackText(
	editor: NonNullable<ReturnType<typeof useEditor>>,
	uploadId: string,
	label: string,
): boolean {
	const tr = editor.state.tr;
	const paragraph = editor.state.schema.nodes.paragraph;
	const textNode = editor.state.schema.text;
	let changed = false;
	editor.state.doc.descendants((node, pos) => {
		if (changed || node.type.name !== "image") return;
		if ((node.attrs.uploadId as string | null) !== uploadId) return;
		const fallbackText = `[${PASTE_FAILURE_PREFIX}: ${label}]`;
		if (paragraph) {
			tr.replaceWith(
				pos,
				pos + node.nodeSize,
				paragraph.create(null, fallbackText ? textNode(fallbackText) : null),
			);
		} else {
			tr.delete(pos, pos + node.nodeSize);
		}
		changed = true;
	});
	if (!changed) return false;
	editor.view.dispatch(tr);
	return true;
}

function getInsertableMarkdownContent(
	markdownManager: MarkdownManager,
	text: string,
): JSONContent[] {
	const parsed = markdownManager.parse(preprocessMarkdownForEditor(text));
	const content = Array.isArray(parsed.content) ? parsed.content : [];
	if (content.length !== 1 || content[0]?.type !== "paragraph") {
		return content;
	}
	return Array.isArray(content[0].content) ? content[0].content : [];
}

function shouldHandleSmartMarkdownPaste(
	clipboardText: string,
	clipboardHtml: string,
): boolean {
	const normalizedText = normalizeClipboardMarkdownText(clipboardText).trim();
	if (!looksLikeMarkdownPaste(normalizedText)) return false;
	const normalizedHtml = extractPlainTextFromClipboardHtml(clipboardHtml);
	if (!normalizedHtml) return true;
	return normalizedHtml === normalizedText;
}

interface UseNoteEditorOptions {
	markdown: string;
	mode: NoteInlineEditorMode;
	relPath?: string;
	interactive?: boolean;
	enableHydrateInlineImages?: boolean;
	enableMarkdownLinkAutocomplete?: boolean;
	pasteMarkdownBehavior?: PasteMarkdownBehavior;
	onChange: (nextMarkdown: string) => void;
}

function expandMarkdownLinkForEditing(
	view: EditorView,
	link: HTMLAnchorElement,
): boolean {
	const href = link.getAttribute("href")?.trim() ?? "";
	if (!href) return false;
	if (href.startsWith("#")) return false;

	const linkText = (link.textContent ?? "").trim() || href;
	const markdown = `[${linkText}](${href})`;

	try {
		const from = view.posAtDOM(link, 0);
		const to = view.posAtDOM(link, link.childNodes.length);
		if (from >= to) return false;

		const hrefStart = from + markdown.lastIndexOf(href);
		const hrefEnd = hrefStart + href.length;
		let tr = view.state.tr.insertText(markdown, from, to);
		try {
			tr = tr.setSelection(TextSelection.create(tr.doc, hrefStart, hrefEnd));
		} catch {
			// Fallback for malformed/mocked docs; the inserted markdown still edits correctly.
		}
		view.dispatch(tr.scrollIntoView());
		view.focus();
		return true;
	} catch {
		return false;
	}
}

function isExpandedMarkdownUrlLink(link: HTMLAnchorElement): boolean {
	const href = link.getAttribute("href")?.trim() ?? "";
	const text = link.textContent?.trim() ?? "";
	if (!href || text !== href) return false;
	const previousText = link.previousSibling?.textContent ?? "";
	const nextText = link.nextSibling?.textContent ?? "";
	return previousText.endsWith("](") && nextText.startsWith(")");
}

function handleEditorClick(
	event: MouseEvent,
	view: EditorView,
	relPath: string,
	interactive: boolean,
	editable: boolean,
): boolean {
	const target = event.target instanceof Element ? event.target : null;
	const tagToken = target?.closest(".tagToken") as HTMLElement | null;
	if (tagToken) {
		if (!interactive) {
			event.preventDefault();
			return true;
		}
		event.preventDefault();
		const rawTag =
			tagToken.getAttribute("data-tag") ?? tagToken.textContent ?? "";
		const normalized = rawTag.trim().replace(/^#+/, "");
		if (!normalized) return true;
		dispatchTagClick({ tag: `#${normalized}` });
		return true;
	}

	const personToken = target?.closest(".personToken") as HTMLElement | null;
	if (personToken) {
		if (!interactive) {
			event.preventDefault();
			return true;
		}
		event.preventDefault();
		const rawHandle =
			personToken.getAttribute("data-handle") ?? personToken.textContent ?? "";
		const normalized = rawHandle.trim().replace(/^@+/, "");
		if (!normalized) return true;
		dispatchPersonClick({ handle: `@${normalized}` });
		return true;
	}

	const wikiLink = target?.closest(
		'[data-wikilink="true"]',
	) as HTMLElement | null;
	if (wikiLink) {
		if (!interactive) {
			event.preventDefault();
			return true;
		}
		event.preventDefault();
		dispatchWikiLinkClick({
			raw: wikiLink.getAttribute("data-raw") ?? wikiLink.textContent ?? "",
			target: wikiLink.getAttribute("data-target") ?? "",
			alias: wikiLink.getAttribute("data-alias") || null,
			anchorKind:
				(wikiLink.getAttribute("data-anchor-kind") as
					| "none"
					| "heading"
					| "block") ?? "none",
			anchor: wikiLink.getAttribute("data-anchor") || null,
			unresolved: wikiLink.getAttribute("data-unresolved") === "true",
			embed: wikiLink.getAttribute("data-wikilink-embed") === "true",
		});
		return true;
	}

	const link = target?.closest("a") as HTMLAnchorElement | null;
	if (!link) return false;
	const href = link?.getAttribute("href") ?? "";
	if (!href) return false;
	if (!interactive) {
		event.preventDefault();
		return true;
	}
	if (href.startsWith("#")) return false;
	event.preventDefault();
	if (
		editable &&
		isExpandedMarkdownUrlLink(link) &&
		(href.startsWith("http://") || href.startsWith("https://"))
	) {
		void openUrl(href);
		return true;
	}
	if (editable && expandMarkdownLinkForEditing(view, link)) {
		return true;
	}
	if (href.startsWith("http://") || href.startsWith("https://")) {
		void openUrl(href);
		return true;
	}
	dispatchMarkdownLinkClick({
		href,
		sourcePath: relPath,
	});
	return true;
}

export function useNoteEditor({
	markdown,
	mode,
	relPath = "",
	interactive = true,
	enableHydrateInlineImages = true,
	enableMarkdownLinkAutocomplete = true,
	pasteMarkdownBehavior = "plain-text",
	onChange,
}: UseNoteEditorOptions) {
	const { frontmatter, body } = splitYamlFrontmatter(markdown);
	const editorBody = preprocessMarkdownForEditor(body);

	const frontmatterRef = useRef(frontmatter);
	const lastAppliedBodyRef = useRef(editorBody);
	const lastEmittedMarkdownRef = useRef(markdown);
	const suppressUpdateRef = useRef(false);
	const relPathRef = useRef(relPath);
	const interactiveRef = useRef(interactive);
	const modeRef = useRef(mode);
	const attachmentStorageModeRef = useRef<AttachmentStorageMode>("note-folder");
	const attachmentFolderRef = useRef<string | null>(DEFAULT_ATTACHMENT_FOLDER);
	const editorRef = useRef<ReturnType<typeof useEditor>>(null);
	const [showCollapsibleHeadings, setShowCollapsibleHeadings] = useState(false);
	const [showFrontmatterInEditor, setShowFrontmatterInEditor] = useState(false);
	const [colorfulHeadings, setColorfulHeadings] = useState(false);
	const [peopleMentionsEnabled, setPeopleMentionsEnabled] = useState(false);
	const [vimKeybindingsEnabled, setVimKeybindingsEnabled] = useState(false);
	const extensions = useMemo(
		() =>
			createEditorExtensions({
				currentPath: "",
				currentPathResolver: () => relPathRef.current,
				enableMarkdownLinkAutocomplete,
				enablePeopleMentions: peopleMentionsEnabled,
				enableVimKeybindings: vimKeybindingsEnabled,
				placeholder: "Start writing or press / for commands",
			}),
		[
			enableMarkdownLinkAutocomplete,
			peopleMentionsEnabled,
			vimKeybindingsEnabled,
		],
	);
	const markdownManager = useMemo(
		() =>
			pasteMarkdownBehavior === "smart-markdown"
				? new MarkdownManager({
						extensions,
						markedOptions: {
							gfm: true,
							breaks: false,
						},
					})
				: null,
		[extensions, pasteMarkdownBehavior],
	);

	useEffect(() => {
		let cancelled = false;
		void loadSettings()
			.then((settings) => {
				if (cancelled) return;
				setShowCollapsibleHeadings(settings.editor.showCollapsibleHeadings);
				setShowFrontmatterInEditor(
					settings.editor.showFrontmatterInEditor === true,
				);
				setColorfulHeadings(settings.editor.colorfulHeadings);
				setPeopleMentionsEnabled(settings.editor.enablePeopleMentionsAsTags);
				setVimKeybindingsEnabled(settings.editor.vimKeybindings === true);
				attachmentStorageModeRef.current =
					settings.editor.attachmentStorageMode;
				attachmentFolderRef.current = settings.editor.attachmentFolder;
			})
			.catch(() => {
				if (cancelled) return;
				setShowCollapsibleHeadings(false);
				setShowFrontmatterInEditor(false);
				setColorfulHeadings(false);
				setPeopleMentionsEnabled(false);
				setVimKeybindingsEnabled(false);
				attachmentStorageModeRef.current = "note-folder";
				attachmentFolderRef.current = DEFAULT_ATTACHMENT_FOLDER;
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useTauriEvent("settings:updated", (payload) => {
		if (typeof payload.editor?.showCollapsibleHeadings === "boolean") {
			setShowCollapsibleHeadings(payload.editor.showCollapsibleHeadings);
		}
		if (typeof payload.editor?.showFrontmatterInEditor === "boolean") {
			setShowFrontmatterInEditor(payload.editor.showFrontmatterInEditor);
		}
		if (typeof payload.editor?.colorfulHeadings === "boolean") {
			setColorfulHeadings(payload.editor.colorfulHeadings);
		}
		if (typeof payload.editor?.enablePeopleMentionsAsTags === "boolean") {
			setPeopleMentionsEnabled(payload.editor.enablePeopleMentionsAsTags);
		}
		if (typeof payload.editor?.vimKeybindings === "boolean") {
			setVimKeybindingsEnabled(payload.editor.vimKeybindings);
		}
		if (payload.editor?.attachmentStorageMode) {
			attachmentStorageModeRef.current = payload.editor.attachmentStorageMode;
		}
		if ("attachmentFolder" in (payload.editor ?? {})) {
			attachmentFolderRef.current = payload.editor?.attachmentFolder ?? null;
		}
	});

	frontmatterRef.current = frontmatter;
	relPathRef.current = relPath;
	interactiveRef.current = interactive;
	modeRef.current = mode;

	const editor = useEditor(
		{
			extensions,
			content: editorBody,
			contentType: "markdown",
			editorProps: {
				attributes: {
					class: "tiptapContentInline",
					spellcheck: "true",
				},
				handleDOMEvents: {
					click: (view, event): boolean => {
						if (!(event instanceof MouseEvent)) return false;
						return handleEditorClick(
							event,
							view,
							relPathRef.current,
							interactiveRef.current,
							modeRef.current === "rich",
						);
					},
					paste: (_view, event) => {
						if (!(event instanceof ClipboardEvent)) return false;
						const editorInstance = editorRef.current;
						if (!editorInstance) return false;
						if (modeRef.current !== "rich") return false;
						if (!editorInstance.isEditable) return false;
						const imageFiles = getPastedImageFiles(event);
						if (imageFiles.length) {
							if (!relPathRef.current) return false;
							const sourcePath = relPathRef.current;
							const targetDir = resolveAttachmentTargetDir(
								attachmentStorageModeRef.current,
								attachmentFolderRef.current,
								sourcePath,
							);
							const selectionRange = {
								from: editorInstance.state.selection.from,
								to: editorInstance.state.selection.to,
							};
							const placeholders = imageFiles.map((file, index) => ({
								file,
								uploadId: `paste-${Date.now()}-${index}-${crypto.randomUUID()}`,
								objectUrl: URL.createObjectURL(file),
							}));
							const placeholderNodes = placeholders.map((item) => ({
								type: "image",
								attrs: {
									src: item.objectUrl,
									alt: item.file.name || "",
									title: "",
									originSrc: "",
									uploadId: item.uploadId,
								},
							}));
							if (
								!editorInstance
									.can()
									.insertContentAt(selectionRange, placeholderNodes)
							) {
								for (const item of placeholders) {
									URL.revokeObjectURL(item.objectUrl);
								}
								return false;
							}
							const inserted = editorInstance
								.chain()
								.focus()
								.insertContentAt(selectionRange, placeholderNodes)
								.run();
							if (!inserted) {
								for (const item of placeholders) {
									URL.revokeObjectURL(item.objectUrl);
								}
								return false;
							}
							event.preventDefault();
							void (async () => {
								for (const item of placeholders) {
									try {
										const dataUrl = await readFileAsDataUrl(item.file);
										const saved = await invoke("space_save_pasted_image", {
											source_path: sourcePath,
											target_dir: targetDir,
											data_url: dataUrl,
											alt: item.file.name || null,
										});
										replacePlaceholderWithImage(editorInstance, item.uploadId, {
											src: dataUrl,
											alt: item.file.name || "",
											title: "",
											originSrc: saved.href,
										});
									} catch {
										replacePlaceholderWithFallbackText(
											editorInstance,
											item.uploadId,
											item.file.name || "image",
										);
									} finally {
										URL.revokeObjectURL(item.objectUrl);
									}
								}
							})();
							return true;
						}
						if (pasteMarkdownBehavior !== "smart-markdown") return false;
						if (editorInstance.isActive("codeBlock")) return false;
						const clipboardHtml = getClipboardHtml(event);
						const clipboardText = normalizeClipboardMarkdownText(
							getClipboardPlainText(event),
						);
						if (!shouldHandleSmartMarkdownPaste(clipboardText, clipboardHtml)) {
							return false;
						}
						const selectionRange = {
							from: editorInstance.state.selection.from,
							to: editorInstance.state.selection.to,
						};
						if (!markdownManager) return false;
						const insertableContent = getInsertableMarkdownContent(
							markdownManager,
							clipboardText,
						);
						if (!insertableContent.length) return false;
						if (
							!editorInstance
								.can()
								.insertContentAt(selectionRange, insertableContent)
						) {
							return false;
						}
						const inserted = editorInstance
							.chain()
							.focus()
							.insertContentAt(selectionRange, insertableContent)
							.run();
						if (!inserted) return false;
						event.preventDefault();
						return true;
					},
				},
			},
			onTransaction: ({ editor: instance, transaction }) => {
				if (!transaction.docChanged) return;
				if (suppressUpdateRef.current) {
					suppressUpdateRef.current = false;
					return;
				}
				if (mode !== "rich" || !instance.isEditable) return;
				const nextBody = postprocessMarkdownFromEditor(instance.getMarkdown());
				lastAppliedBodyRef.current = preprocessMarkdownForEditor(nextBody);
				const nextMarkdown = joinYamlFrontmatter(
					frontmatterRef.current,
					normalizeBody(nextBody),
				);
				if (nextMarkdown === lastEmittedMarkdownRef.current) return;
				lastEmittedMarkdownRef.current = nextMarkdown;
				onChange(nextMarkdown);
			},
		},
		[
			peopleMentionsEnabled,
			enableMarkdownLinkAutocomplete,
			vimKeybindingsEnabled,
		],
	);
	editorRef.current = editor;

	useEffect(() => {
		if (!editor) return;
		editor.setEditable(mode === "rich");
	}, [editor, mode]);

	useEffect(() => {
		if (!editor) return;
		editor.commands.setHeadingCollapseEnabled(showCollapsibleHeadings);
	}, [editor, showCollapsibleHeadings]);

	useEffect(() => {
		if (!editor) return;
		if (markdown === lastEmittedMarkdownRef.current) return;
		if (editorBody === lastAppliedBodyRef.current) return;
		suppressUpdateRef.current = true;
		editor.commands.setContent(editorBody, { contentType: "markdown" });
		lastAppliedBodyRef.current = editorBody;
		lastEmittedMarkdownRef.current = markdown;
	}, [editor, editorBody, markdown]);

	useHydrateInlineImages(editor, enableHydrateInlineImages ? relPath : "");

	return {
		editor,
		frontmatter,
		colorfulHeadings,
		showFrontmatterInEditor,
		frontmatterRef,
		lastAppliedBodyRef,
		lastEmittedMarkdownRef,
	};
}
