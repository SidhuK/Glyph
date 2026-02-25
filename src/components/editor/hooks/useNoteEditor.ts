import { openUrl } from "@tauri-apps/plugin-opener";
import { useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";
import {
	joinYamlFrontmatter,
	splitYamlFrontmatter,
} from "../../../lib/notePreview";
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

function normalizeBody(markdown: string): string {
	return markdown.replace(/\u00a0/g, " ").replace(/&nbsp;/g, " ");
}

interface UseNoteEditorOptions {
	markdown: string;
	mode: CanvasInlineEditorMode;
	relPath?: string;
	onChange: (nextMarkdown: string) => void;
}

function handleEditorClick(event: MouseEvent, relPath: string): boolean {
	const target = event.target instanceof Element ? event.target : null;
	const tagToken = target?.closest(".tagToken") as HTMLElement | null;
	if (tagToken) {
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
	onChange,
}: UseNoteEditorOptions) {
	const { frontmatter, body } = splitYamlFrontmatter(markdown);
	const editorBody = preprocessMarkdownForEditor(body);

	const frontmatterRef = useRef(frontmatter);
	const lastAppliedBodyRef = useRef(editorBody);
	const lastEmittedMarkdownRef = useRef(markdown);
	const ignoreNextUpdateRef = useRef(false);
	const suppressUpdateRef = useRef(false);
	const extensions = useMemo(
		() =>
			createEditorExtensions({
				currentPath: relPath,
				enableMarkdownLinkAutocomplete: true,
			}),
		[relPath],
	);

	useEffect(() => {
		frontmatterRef.current = frontmatter;
	}, [frontmatter]);

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
					return handleEditorClick(event, relPath);
				},
			},
		},
		onTransaction: ({ editor: instance, transaction }) => {
			if (!transaction.docChanged) return;
			if (suppressUpdateRef.current) {
				suppressUpdateRef.current = false;
				return;
			}
			if (ignoreNextUpdateRef.current) {
				ignoreNextUpdateRef.current = false;
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
		if (mode === "rich") {
			ignoreNextUpdateRef.current = true;
		}
	}, [editor, mode]);

	useEffect(() => {
		if (!editor) return;
		if (markdown === lastEmittedMarkdownRef.current) return;
		if (editorBody === lastAppliedBodyRef.current) return;
		suppressUpdateRef.current = true;
		editor.commands.setContent(editorBody, { contentType: "markdown" });
		lastAppliedBodyRef.current = editorBody;
		lastEmittedMarkdownRef.current = markdown;
	}, [editor, editorBody, markdown]);

	return {
		editor,
		frontmatter,
		body,
		frontmatterRef,
		lastAppliedBodyRef,
		lastEmittedMarkdownRef,
	};
}
