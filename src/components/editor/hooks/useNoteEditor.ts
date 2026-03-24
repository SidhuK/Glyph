import { openUrl } from "@tauri-apps/plugin-opener";
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
import {
	postprocessMarkdownFromEditor,
	preprocessMarkdownForEditor,
} from "../markdown/wikiLinkMarkdownBridge";
import type { CanvasInlineEditorMode } from "../types";
import { useHydrateInlineImages } from "./useHydrateInlineImages";

function normalizeBody(markdown: string): string {
	return markdown.replace(/\u00a0/g, " ").replace(/&nbsp;/g, " ");
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

interface UseNoteEditorOptions {
	markdown: string;
	mode: CanvasInlineEditorMode;
	relPath?: string;
	interactive?: boolean;
	enableHydrateInlineImages?: boolean;
	enableMarkdownLinkAutocomplete?: boolean;
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
					if (mode !== "rich" || !relPathRef.current) return false;
					const imageFiles = getPastedImageFiles(event);
					if (!imageFiles.length) return false;
					const sourcePath = relPathRef.current;
					const targetDir = pastedMediaFolderRef.current;
					event.preventDefault();
					void (async () => {
						for (const file of imageFiles) {
							const dataUrl = await readFileAsDataUrl(file);
							const saved = await invoke("space_save_pasted_image", {
								source_path: sourcePath,
								target_dir: targetDir,
								data_url: dataUrl,
								alt: file.name || null,
							});
							const imagePayload = {
								type: "image",
								attrs: {
									src: dataUrl,
									alt: file.name || "",
									title: "",
									originSrc: saved.href,
								},
							};
							editor.chain().focus().insertContent(imagePayload).run();
						}
					})().catch(() => {
						// Ignore failed clipboard saves so the editor stays responsive.
					});
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
