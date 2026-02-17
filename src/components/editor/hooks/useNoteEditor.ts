import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";
import {
	joinYamlFrontmatter,
	splitYamlFrontmatter,
} from "../../../lib/notePreview";
import { invoke } from "../../../lib/tauri";
import { normalizeRelPath, parentDir } from "../../../utils/path";
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

const IMAGE_RESOLVE_RETRY_WINDOW_MS = 3_000;

function normalizeBody(markdown: string): string {
	return markdown.replace(/\u00a0/g, " ").replace(/&nbsp;/g, " ");
}

function normalizeSegments(path: string): string {
	const stack: string[] = [];
	for (const part of path.split("/")) {
		if (!part || part === ".") continue;
		if (part === "..") {
			stack.pop();
			continue;
		}
		stack.push(part);
	}
	return normalizeRelPath(stack.join("/"));
}

function resolveRelativeAssetPath(
	sourcePath: string,
	href: string,
): string | null {
	const cleaned = href.split("#", 1)[0]?.trim().replace(/\\/g, "/") ?? "";
	if (!cleaned) return null;
	if (/^[a-z][a-z0-9+.-]*:/i.test(cleaned)) return null;
	const base = cleaned.startsWith("/")
		? cleaned
		: `${parentDir(sourcePath)}/${cleaned}`;
	return normalizeSegments(base);
}

function isRemoteAssetPath(path: string): boolean {
	return (
		path.startsWith("http://") ||
		path.startsWith("https://") ||
		path.startsWith("data:") ||
		path.startsWith("blob:") ||
		path.startsWith("asset:")
	);
}

function listAssetPathCandidates(
	sourcePath: string,
	rawPath: string,
): string[] {
	const cleaned = rawPath.split("#", 1)[0]?.trim().replace(/\\/g, "/") ?? "";
	if (!cleaned || /^[a-z][a-z0-9+.-]*:/i.test(cleaned)) return [];
	const candidates: string[] = [];
	const rel = resolveRelativeAssetPath(sourcePath, cleaned);
	if (rel) candidates.push(rel);
	const rootish = cleaned.startsWith("/")
		? normalizeSegments(cleaned.slice(1))
		: normalizeSegments(cleaned);
	if (rootish && !candidates.includes(rootish)) candidates.push(rootish);
	return candidates;
}

interface UseNoteEditorOptions {
	markdown: string;
	mode: CanvasInlineEditorMode;
	relPath?: string;
	onChange: (nextMarkdown: string) => void;
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
			handleClick: (_view, _pos, event) => {
				const target = event.target as HTMLElement | null;
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
		if (!editor || !relPath) return;
		let cancelled = false;
		let scheduled = false;
		const resolvedByPath = new Map<string, string>();
		const inFlightBySource = new Map<string, Promise<string | null>>();
		const failedAtBySource = new Map<string, number>();

		const resolveCandidate = async (
			candidate: string,
		): Promise<string | null> => {
			const cached = resolvedByPath.get(candidate);
			if (cached) return cached;
			try {
				const preview = await invoke("vault_read_binary_preview", {
					path: candidate,
					max_bytes: 8 * 1024 * 1024,
				});
				resolvedByPath.set(candidate, preview.data_url);
				return preview.data_url;
			} catch {
				// Some formats are not supported by binary preview, so use file source.
			}
			try {
				const abs = await invoke("vault_resolve_abs_path", { path: candidate });
				const converted = convertFileSrc(abs);
				resolvedByPath.set(candidate, converted);
				return converted;
			} catch {
				return null;
			}
		};

		const resolveSource = async (source: string): Promise<string | null> => {
			const failedAt = failedAtBySource.get(source);
			if (
				failedAt !== undefined &&
				Date.now() - failedAt < IMAGE_RESOLVE_RETRY_WINDOW_MS
			) {
				return null;
			}
			const inFlight = inFlightBySource.get(source);
			if (inFlight) return inFlight;
			const pending = (async () => {
				const candidates = listAssetPathCandidates(relPath, source);
				for (const candidate of candidates) {
					const resolved = await resolveCandidate(candidate);
					if (resolved) return resolved;
				}
				failedAtBySource.set(source, Date.now());
				return null;
			})();
			inFlightBySource.set(source, pending);
			try {
				return await pending;
			} finally {
				inFlightBySource.delete(source);
			}
		};

		const resolveImage = async (img: HTMLImageElement) => {
			const source = (
				img.getAttribute("data-cipher-source-src") ??
				img.getAttribute("src") ??
				""
			).trim();
			if (!source || isRemoteAssetPath(source)) return;
			const alreadyResolvedFrom =
				img.getAttribute("data-cipher-resolved-from") ?? "";
			if (alreadyResolvedFrom === source && isRemoteAssetPath(img.src)) return;
			const converted = await resolveSource(source);
			if (!converted || cancelled) return;
			const latestSource = (
				img.getAttribute("data-cipher-source-src") ??
				img.getAttribute("src") ??
				""
			).trim();
			if (!latestSource || latestSource !== source) return;
			if (img.src === converted) {
				img.setAttribute("data-cipher-resolved-from", source);
				return;
			}
			img.setAttribute("data-cipher-source-src", source);
			img.setAttribute("data-cipher-resolved-from", source);
			img.src = converted;
		};

		const processImages = () => {
			scheduled = false;
			const images = editor.view.dom.querySelectorAll("img");
			for (const node of images) void resolveImage(node as HTMLImageElement);
		};

		const scheduleProcess = () => {
			if (scheduled) return;
			scheduled = true;
			requestAnimationFrame(processImages);
		};

		scheduleProcess();
		editor.on("update", scheduleProcess);
		const observer = new MutationObserver(() => scheduleProcess());
		observer.observe(editor.view.dom, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ["src"],
		});
		return () => {
			cancelled = true;
			editor.off("update", scheduleProcess);
			observer.disconnect();
		};
	}, [editor, relPath]);

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
