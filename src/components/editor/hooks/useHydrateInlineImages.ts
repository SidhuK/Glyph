import type { Editor } from "@tiptap/core";
import { useEffect } from "react";
import { invoke } from "../../../lib/tauri";

const INLINE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const INLINE_IMAGE_CACHE_MAX = 256;

const dataUrlCache = new Map<string, string>();
const missCache = new Set<string>();
const inFlightCache = new Map<string, Promise<string | null>>();

function trimOldestCacheEntries() {
	while (dataUrlCache.size > INLINE_IMAGE_CACHE_MAX) {
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
	dataUrlCache.clear();
	missCache.clear();
	inFlightCache.clear();
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

async function resolveSpaceImagePath(
	sourcePath: string,
	href: string,
): Promise<string | null> {
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
): Promise<string | null> {
	const key = `${sourcePath}::${rawSrc}`;
	if (dataUrlCache.has(key)) return dataUrlCache.get(key) ?? null;
	if (missCache.has(key)) return null;
	if (inFlightCache.has(key)) return inFlightCache.get(key) ?? null;

	const promise = (async () => {
		try {
			const relPath = await resolveSpaceImagePath(sourcePath, rawSrc);
			if (!relPath) {
				missCache.add(key);
				trimOldestCacheEntries();
				return null;
			}
			const preview = await invoke("space_read_binary_preview", {
				path: relPath,
				max_bytes: INLINE_IMAGE_MAX_BYTES,
			});
			if (preview.truncated) {
				missCache.add(key);
				trimOldestCacheEntries();
				return null;
			}
			dataUrlCache.set(key, preview.data_url);
			trimOldestCacheEntries();
			return preview.data_url;
		} catch {
			missCache.add(key);
			trimOldestCacheEntries();
			return null;
		} finally {
			inFlightCache.delete(key);
		}
	})();

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
				const key = `${sourcePath}::${originalSrc}`;
				if (image.getAttribute("data-glyph-hydrated-key") === key) continue;
				void resolveInlineImageDataUrl(sourcePath, originalSrc).then(
					(dataUrl) => {
						if (cancelled || !dataUrl || !image.isConnected) return;
						image.setAttribute("data-glyph-hydrated-key", key);
						image.setAttribute("src", dataUrl);
					},
				);
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
			connectObserver();
		};

		const handleUnmount = () => {
			disconnectObserver();
		};

		connectObserver();
		editor.on("mount", handleMount);
		editor.on("unmount", handleUnmount);

		return () => {
			cancelled = true;
			editor.off("mount", handleMount);
			editor.off("unmount", handleUnmount);
			disconnectObserver();
		};
	}, [editor, sourcePath]);
}
