import type { Editor } from "@tiptap/core";
import { useEffect } from "react";
import { invoke } from "../../../lib/tauri";

const INLINE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const INLINE_IMAGE_CACHE_MAX = 64;
const INLINE_IMAGE_CACHE_MAX_BYTES = 24 * 1024 * 1024;

const dataUrlCache = new Map<string, string>();
const missCache = new Set<string>();
const inFlightCache = new Map<string, Promise<string | null>>();
const sourceGeneration = new Map<string, number>();
const sourceConsumers = new Map<string, number>();
let globalGeneration = 0;
let nextSourceGeneration = 1;

function getSourceGeneration(sourcePath: string): number {
	const existing = sourceGeneration.get(sourcePath);
	if (existing !== undefined) return existing;
	const next = nextSourceGeneration++;
	sourceGeneration.set(sourcePath, next);
	return next;
}

function matchesGeneration(
	sourcePath: string,
	expectedGlobalGeneration: number,
	expectedSourceGeneration: number,
): boolean {
	return (
		expectedGlobalGeneration === globalGeneration &&
		expectedSourceGeneration === getSourceGeneration(sourcePath)
	);
}

function getCacheBytes(): number {
	let total = 0;
	for (const value of dataUrlCache.values()) {
		total += value.length;
	}
	return total;
}

function trimOldestCacheEntries() {
	while (dataUrlCache.size > INLINE_IMAGE_CACHE_MAX) {
		const oldestKey = dataUrlCache.keys().next().value;
		if (!oldestKey) break;
		dataUrlCache.delete(oldestKey);
	}
	while (getCacheBytes() > INLINE_IMAGE_CACHE_MAX_BYTES) {
		const oldestKey = dataUrlCache.keys().next().value;
		if (!oldestKey) break;
		dataUrlCache.delete(oldestKey);
	}
	while (missCache.size > INLINE_IMAGE_CACHE_MAX) {
		const oldestKey = missCache.values().next().value;
		if (!oldestKey) break;
		missCache.delete(oldestKey);
	}
}

export function clearInlineImageHydrationCache() {
	globalGeneration += 1;
	sourceGeneration.clear();
	sourceConsumers.clear();
	dataUrlCache.clear();
	missCache.clear();
	inFlightCache.clear();
}

function maybeDeleteSourceGeneration(sourcePath: string) {
	const prefix = `${sourcePath}::`;
	const hasEntries =
		[...dataUrlCache.keys()].some((key) => key.startsWith(prefix)) ||
		[...missCache].some((key) => key.startsWith(prefix)) ||
		[...inFlightCache.keys()].some((key) => key.startsWith(prefix));
	if (!hasEntries && (sourceConsumers.get(sourcePath) ?? 0) === 0) {
		sourceGeneration.delete(sourcePath);
	}
}

function clearInlineImageHydrationCacheForSource(sourcePath: string) {
	sourceGeneration.set(sourcePath, getSourceGeneration(sourcePath) + 1);
	const prefix = `${sourcePath}::`;
	// Wiki image-link keys are global (`wiki-image-link::...`) and intentionally
	// survive per-source invalidation because they do not depend on sourcePath.
	for (const key of [...dataUrlCache.keys()]) {
		if (key.startsWith(prefix)) dataUrlCache.delete(key);
	}
	for (const key of [...missCache]) {
		if (key.startsWith(prefix)) missCache.delete(key);
	}
	for (const key of [...inFlightCache.keys()]) {
		if (key.startsWith(prefix)) inFlightCache.delete(key);
	}
	maybeDeleteSourceGeneration(sourcePath);
}

function incrementInlineImageHydrationConsumers(sourcePath: string) {
	sourceConsumers.set(sourcePath, (sourceConsumers.get(sourcePath) ?? 0) + 1);
	getSourceGeneration(sourcePath);
}

function decrementInlineImageHydrationConsumers(sourcePath: string) {
	const next = (sourceConsumers.get(sourcePath) ?? 0) - 1;
	if (next > 0) {
		sourceConsumers.set(sourcePath, next);
		return;
	}
	sourceConsumers.delete(sourcePath);
	clearInlineImageHydrationCacheForSource(sourcePath);
}

function isDirectImageUrl(src: string): boolean {
	return /^(https?:|data:|blob:|asset:|tauri:|file:|\/\/)/i.test(src);
}

function dedupeCandidates(href: string): string[] {
	const out = [href];
	if (href.includes("%")) {
		try {
			const decoded = decodeURIComponent(href);
			if (decoded && decoded !== href) out.push(decoded);
		} catch {
			// Ignore malformed escape sequences.
		}
	}
	return Array.from(new Set(out));
}

type InlineImageResolverKind = "markdown-link" | "wiki-image-link";

function getInlineImageCacheKey(
	sourcePath: string,
	rawSrc: string,
	kind: InlineImageResolverKind,
): string {
	if (kind === "wiki-image-link") {
		return `${kind}::${rawSrc}`;
	}
	return `${sourcePath}::${kind}::${rawSrc}`;
}

function getResolverKindForImage(image: Element): InlineImageResolverKind {
	return image.getAttribute("data-wikilink-embed") === "true"
		? "wiki-image-link"
		: "markdown-link";
}

async function resolveSpaceImagePath(
	sourcePath: string,
	href: string,
	kind: InlineImageResolverKind,
): Promise<string | null> {
	if (kind === "wiki-image-link") {
		for (const candidate of dedupeCandidates(href)) {
			const resolved = await invoke("space_resolve_image_wikilink", {
				target: candidate,
			});
			if (resolved) return resolved;
		}
		return null;
	}
	for (const candidate of dedupeCandidates(href)) {
		const resolved = await invoke("space_resolve_markdown_link", {
			href: candidate,
			sourcePath,
		});
		if (resolved) return resolved;
	}
	return null;
}

async function resolveInlineImageDataUrl(
	sourcePath: string,
	rawSrc: string,
	kind: InlineImageResolverKind,
): Promise<string | null> {
	const key = getInlineImageCacheKey(sourcePath, rawSrc, kind);
	if (dataUrlCache.has(key)) return dataUrlCache.get(key) ?? null;
	if (missCache.has(key)) return null;
	if (inFlightCache.has(key)) return inFlightCache.get(key) ?? null;
	const expectedGlobalGeneration = globalGeneration;
	const expectedSourceGeneration = getSourceGeneration(sourcePath);
	let activePromise: Promise<string | null> | null = null;

	const promise = (async () => {
		try {
			const relPath = await resolveSpaceImagePath(sourcePath, rawSrc, kind);
			if (
				!matchesGeneration(
					sourcePath,
					expectedGlobalGeneration,
					expectedSourceGeneration,
				)
			) {
				return null;
			}
			if (!relPath) {
				missCache.add(key);
				trimOldestCacheEntries();
				return null;
			}
			const preview = await invoke("space_read_binary_preview", {
				path: relPath,
				max_bytes: INLINE_IMAGE_MAX_BYTES,
			});
			if (
				!matchesGeneration(
					sourcePath,
					expectedGlobalGeneration,
					expectedSourceGeneration,
				)
			) {
				return null;
			}
			if (preview.truncated) {
				missCache.add(key);
				trimOldestCacheEntries();
				return null;
			}
			dataUrlCache.set(key, preview.data_url);
			trimOldestCacheEntries();
			return preview.data_url;
		} catch {
			if (
				matchesGeneration(
					sourcePath,
					expectedGlobalGeneration,
					expectedSourceGeneration,
				)
			) {
				missCache.add(key);
				trimOldestCacheEntries();
			}
			return null;
		} finally {
			if (inFlightCache.get(key) === activePromise) {
				inFlightCache.delete(key);
			}
		}
	})();
	activePromise = promise;

	inFlightCache.set(key, promise);
	return promise;
}

function getMountedEditorRoot(editor: Editor): HTMLElement | null {
	try {
		const root = editor.view.dom;
		return root instanceof HTMLElement ? root : null;
	} catch {
		return null;
	}
}

function hydrateImageNodesInDocument(
	editor: Editor,
	originalSrc: string,
	dataUrl: string,
) {
	const tr = editor.state.tr;
	let changed = false;
	editor.state.doc.descendants((node, pos) => {
		if (node.type.name !== "image") return;
		const currentSrc = typeof node.attrs.src === "string" ? node.attrs.src : "";
		const currentOrigin =
			typeof node.attrs.originSrc === "string" && node.attrs.originSrc.trim()
				? node.attrs.originSrc
				: currentSrc;
		if (currentOrigin !== originalSrc) return;
		if (currentSrc === dataUrl && node.attrs.originSrc === originalSrc) return;
		tr.setNodeMarkup(pos, undefined, {
			...node.attrs,
			src: dataUrl,
			originSrc: originalSrc,
		});
		changed = true;
	});
	if (!changed) return;
	editor.view.dispatch(tr);
}

export function useHydrateInlineImages(
	editor: Editor | null,
	sourcePath: string,
) {
	useEffect(() => {
		if (!editor || !sourcePath) return;

		let cancelled = false;
		let rafId: number | null = null;
		let root: HTMLElement | null = null;
		let observer: MutationObserver | null = null;
		let registeredConsumer = false;

		const hydrateImages = () => {
			if (!root) return;
			const images = root.querySelectorAll("img[src]");
			for (const image of images) {
				const current = image.getAttribute("src")?.trim() ?? "";
				if (!current) continue;
				const originalSrc =
					image.getAttribute("data-glyph-origin-src")?.trim() ?? current;
				if (!originalSrc || isDirectImageUrl(originalSrc)) continue;
				if (image.getAttribute("data-glyph-origin-src") !== originalSrc) {
					image.setAttribute("data-glyph-origin-src", originalSrc);
				}
				const resolverKind = getResolverKindForImage(image);
				const key = getInlineImageCacheKey(
					sourcePath,
					originalSrc,
					resolverKind,
				);
				if (image.getAttribute("data-glyph-hydrated-key") === key) continue;
				void resolveInlineImageDataUrl(
					sourcePath,
					originalSrc,
					resolverKind,
				).then((dataUrl) => {
					if (cancelled || !dataUrl || !image.isConnected) return;
					hydrateImageNodesInDocument(editor, originalSrc, dataUrl);
					image.setAttribute("data-glyph-hydrated-key", key);
					image.setAttribute("src", dataUrl);
				});
			}
		};

		const scheduleHydration = () => {
			if (!root) return;
			if (rafId !== null) return;
			rafId = window.requestAnimationFrame(() => {
				rafId = null;
				if (!cancelled) hydrateImages();
			});
		};

		const disconnectObserver = () => {
			if (rafId !== null) {
				window.cancelAnimationFrame(rafId);
				rafId = null;
			}
			observer?.disconnect();
			observer = null;
			root = null;
		};

		const connectObserver = () => {
			const nextRoot = getMountedEditorRoot(editor);
			if (!nextRoot) return;
			if (root !== nextRoot) {
				disconnectObserver();
				root = nextRoot;
				observer = new MutationObserver(scheduleHydration);
				observer.observe(root, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeFilter: ["src"],
				});
			}
			scheduleHydration();
		};

		const handleMount = () => {
			if (cancelled) return;
			if (!registeredConsumer) {
				incrementInlineImageHydrationConsumers(sourcePath);
				registeredConsumer = true;
			}
			connectObserver();
		};

		const handleUnmount = () => {
			disconnectObserver();
			if (registeredConsumer) {
				decrementInlineImageHydrationConsumers(sourcePath);
				registeredConsumer = false;
			}
		};

		incrementInlineImageHydrationConsumers(sourcePath);
		registeredConsumer = true;
		connectObserver();
		editor.on("mount", handleMount);
		editor.on("unmount", handleUnmount);

		return () => {
			cancelled = true;
			editor.off("mount", handleMount);
			editor.off("unmount", handleUnmount);
			disconnectObserver();
			if (registeredConsumer) {
				decrementInlineImageHydrationConsumers(sourcePath);
				registeredConsumer = false;
			}
		};
	}, [editor, sourcePath]);
}
