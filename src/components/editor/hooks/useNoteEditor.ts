import { openUrl } from "@tauri-apps/plugin-opener";
import type { JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";
import { useState } from "react";
import {
	joinYamlFrontmatter,
	splitYamlFrontmatter,
} from "../../../lib/notePreview";
import { loadSettings } from "../../../lib/settings";
import { invoke } from "../../../lib/tauri";
import { useTauriEvent } from "../../../lib/tauriEvents";
import { createEditorExtensions } from "../extensions";
import {
	dispatchMarkdownLinkClick,
	dispatchTagClick,
	dispatchWikiLinkClick,
} from "../markdown/editorEvents";
import { looksLikeMarkdownPaste } from "../markdown/markdownPaste";
import {
	postprocessMarkdownFromEditor,
	preprocessMarkdownForEditor,
} from "../markdown/wikiLinkMarkdownBridge";
import type { CanvasInlineEditorMode, PasteMarkdownBehavior } from "../types";
import { useHydrateInlineImages } from "./useHydrateInlineImages";

const PASTE_FAILURE_PREFIX = "Image paste failed";

function normalizeBody(markdown: string): string {
	return markdown.replace(/\u00a0/g, " ").replace(/&nbsp;/g, " ");
}

function getClipboardHtml(event: ClipboardEvent): string {
	return event.clipboardData?.getData("text/html") ?? "";
}

function getClipboardPlainText(event: ClipboardEvent): string {
	return event.clipboardData?.getData("text/plain") ?? "";
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

interface UseNoteEditorOptions {
	markdown: string;
	mode: CanvasInlineEditorMode;
	relPath?: string;
	interactive?: boolean;
	enableHydrateInlineImages?: boolean;
	enableMarkdownLinkAutocomplete?: boolean;
	pasteMarkdownBehavior?: PasteMarkdownBehavior;
	onChange: (nextMarkdown: string) => void;
}

function handleEditorClick(
	event: MouseEvent,
	relPath: string,
	interactive: boolean,
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
			raw: wikiLink.textContent ?? "",
			target: wikiLink.getAttribute("data-target") ?? "",
			alias: wikiLink.getAttribute("data-alias") || null,
			anchorKind:
				(wikiLink.getAttribute("data-anchor-kind") as
					| "none"
					| "heading"
					| "block") ?? "none",
			anchor: wikiLink.getAttribute("data-anchor") || null,
			unresolved: wikiLink.getAttribute("data-unresolved") === "true",
		});
		return true;
	}

	const link = target?.closest("a") as HTMLAnchorElement | null;
	const href = link?.getAttribute("href") ?? "";
	if (!href) return false;
	if (!interactive) {
		event.preventDefault();
		return true;
	}
	if (href.startsWith("http://") || href.startsWith("https://")) {
		event.preventDefault();
		void openUrl(href);
		return true;
	}
	if (href.startsWith("#")) return false;
	event.preventDefault();
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
	const pastedMediaFolderRef = useRef("assets");
	const [showCollapsibleHeadings, setShowCollapsibleHeadings] = useState(false);
	const extensions = useMemo(
		() =>
			createEditorExtensions({
				currentPath: "",
				currentPathResolver: () => relPathRef.current,
				enableMarkdownLinkAutocomplete,
			}),
		[enableMarkdownLinkAutocomplete],
	);
	const markdownManager = useMemo(
		() =>
			new MarkdownManager({
				extensions,
				markedOptions: {
					gfm: true,
					breaks: false,
				},
			}),
		[extensions],
	);

	useEffect(() => {
		let cancelled = false;
		void loadSettings()
			.then((settings) => {
				if (cancelled) return;
				setShowCollapsibleHeadings(settings.editor.showCollapsibleHeadings);
				pastedMediaFolderRef.current = settings.editor.pastedMediaFolder;
			})
			.catch(() => {
				if (cancelled) return;
				setShowCollapsibleHeadings(false);
				pastedMediaFolderRef.current = "assets";
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useTauriEvent("settings:updated", (payload) => {
		if (typeof payload.editor?.showCollapsibleHeadings === "boolean") {
			setShowCollapsibleHeadings(payload.editor.showCollapsibleHeadings);
		}
		if (typeof payload.editor?.pastedMediaFolder === "string") {
			pastedMediaFolderRef.current = payload.editor.pastedMediaFolder;
		}
	});

	useEffect(() => {
		frontmatterRef.current = frontmatter;
	}, [frontmatter]);

	useEffect(() => {
		relPathRef.current = relPath;
	}, [relPath]);

	useEffect(() => {
		interactiveRef.current = interactive;
	}, [interactive]);

	const editor = useEditor({
		extensions,
		content: editorBody,
		contentType: "markdown",
		editorProps: {
			attributes: {
				class: "tiptapContentInline",
				spellcheck: "true",
			},
			handleDOMEvents: {
				click: (_view, event) => {
					if (!(event instanceof MouseEvent)) return false;
					return handleEditorClick(
						event,
						relPathRef.current,
						interactiveRef.current,
					);
				},
				paste: (_view, event) => {
					if (!(event instanceof ClipboardEvent)) return false;
					if (!editor) return false;
					if (mode !== "rich") return false;
					if (!editor.isEditable) return false;
					const imageFiles = getPastedImageFiles(event);
					if (imageFiles.length) {
						if (!relPathRef.current) return false;
						const sourcePath = relPathRef.current;
						const targetDir = pastedMediaFolderRef.current;
						const selectionRange = {
							from: editor.state.selection.from,
							to: editor.state.selection.to,
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
							!editor.can().insertContentAt(selectionRange, placeholderNodes)
						) {
							for (const item of placeholders) {
								replacePlaceholderWithFallbackText(
									editor,
									item.uploadId,
									item.file.name || "image",
								);
								URL.revokeObjectURL(item.objectUrl);
							}
							return false;
						}
						const inserted = editor
							.chain()
							.focus()
							.insertContentAt(selectionRange, placeholderNodes)
							.run();
						if (!inserted) {
							for (const item of placeholders) {
								replacePlaceholderWithFallbackText(
									editor,
									item.uploadId,
									item.file.name || "image",
								);
								URL.revokeObjectURL(item.objectUrl);
							}
							return false;
						}
						event.preventDefault();
						void (async () => {
							for (const item of placeholders) {
								const dataUrl = await readFileAsDataUrl(item.file);
								const saved = await invoke("space_save_pasted_image", {
									source_path: sourcePath,
									target_dir: targetDir,
									data_url: dataUrl,
									alt: item.file.name || null,
								});
								replacePlaceholderWithImage(editor, item.uploadId, {
									src: dataUrl,
									alt: item.file.name || "",
									title: "",
									originSrc: saved.href,
								});
								URL.revokeObjectURL(item.objectUrl);
							}
						})().catch(() => {
							for (const item of placeholders) {
								replacePlaceholderWithFallbackText(
									editor,
									item.uploadId,
									item.file.name || "image",
								);
								URL.revokeObjectURL(item.objectUrl);
							}
						});
						return true;
					}
					if (pasteMarkdownBehavior !== "smart-markdown") return false;
					if (editor.isActive("codeBlock")) return false;
					const clipboardHtml = getClipboardHtml(event).trim();
					if (clipboardHtml) return false;
					const clipboardText = getClipboardPlainText(event);
					if (!looksLikeMarkdownPaste(clipboardText)) return false;
					const selectionRange = {
						from: editor.state.selection.from,
						to: editor.state.selection.to,
					};
					const insertableContent = getInsertableMarkdownContent(
						markdownManager,
						clipboardText,
					);
					if (!insertableContent.length) return false;
					if (
						!editor.can().insertContentAt(selectionRange, insertableContent)
					) {
						return false;
					}
					event.preventDefault();
					editor
						.chain()
						.focus()
						.insertContentAt(selectionRange, insertableContent)
						.run();
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
	});

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
		body,
		frontmatterRef,
		lastAppliedBodyRef,
		lastEmittedMarkdownRef,
	};
}
