import { queryOptions, skipToken } from "@tanstack/react-query";
import { isImagePath } from "../utils/path";
import { NAVIGATION_STALE_TIME_MS, navigationQueryKeys } from "./navigationPrefetch";
import { invoke } from "./tauri";

type NoteImageRef =
	| { kind: "markdown-link"; href: string }
	| { kind: "wiki-image-link"; href: string }
	| { kind: "direct"; src: string };

interface NoteImageCandidate {
	index: number;
	ref: NoteImageRef;
}

const NOTE_THUMBNAIL_MAX_BYTES = 4 * 1024 * 1024;
const NOTE_SCAN_MAX_BYTES = 2 * 1024 * 1024;
const NOTE_READ_CONCURRENCY = 4;
// Data URLs are several MB each, so drop them soon after their card unmounts.
const NOTE_IMAGE_GC_TIME_MS = 30 * 1000;
const DIRECT_IMAGE_SRC_RE = /^(?:https?:|data:|blob:)/i;
const URL_RE = /https?:\/\/[^\s<>"'`\]}]+/i;
let activeNoteReads = 0;
const queuedNoteReads: Array<() => void> = [];

function drainNoteReads(): void {
	while (activeNoteReads < NOTE_READ_CONCURRENCY) {
		const next = queuedNoteReads.shift();
		if (!next) return;
		next();
	}
}

function runLimitedNoteRead<T>(read: () => Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		queuedNoteReads.push(() => {
			if (signal.aborted) {
				reject(signal.reason);
				return;
			}
			activeNoteReads += 1;
			read()
				.then(resolve, reject)
				.finally(() => {
					activeNoteReads -= 1;
					drainNoteReads();
				});
		});
		drainNoteReads();
	});
}

export function extractFirstUrl(text: string): string {
	const match = text.match(URL_RE);
	return match?.[0] ? match[0].replace(/[.,;:!?)]+$/g, "") : "";
}

function isImageHref(href: string): boolean {
	return isImagePath(href.replace(/[#?].*$/, ""));
}

function markdownImageHref(rawHref: string): string {
	const href = rawHref.trim();
	const bracketed = href.match(/^<([^>\n]*)>/);
	if (bracketed) return (bracketed[1] ?? "").trim();
	const titleMatch = href.match(/^(.+?)(?:\s+["'][^"'\n]*["'])$/);
	return (titleMatch?.[1] ?? href).trim();
}

function imageRefFromHref(href: string): NoteImageRef | null {
	if (!href) return null;
	if (DIRECT_IMAGE_SRC_RE.test(href)) return { kind: "direct", src: href };
	if (isImageHref(href)) return { kind: "markdown-link", href };
	return null;
}

function referenceImageDefinitions(markdown: string): Map<string, string> {
	const definitions = new Map<string, string>();
	for (const match of markdown.matchAll(/^\s*\[([^\]\n]+)\]:\s*(<[^>\n]+>|\S+)/gm)) {
		const label = (match[1] ?? "").trim().toLowerCase();
		const href = markdownImageHref(match[2] ?? "");
		if (label && href) definitions.set(label, href);
	}
	return definitions;
}

export function extractFirstImageRef(markdown: string): NoteImageRef | null {
	const candidates: NoteImageCandidate[] = [];
	const push = (index: number | undefined, ref: NoteImageRef | null) => {
		if (ref) candidates.push({ index: index ?? Number.MAX_SAFE_INTEGER, ref });
	};

	for (const match of markdown.matchAll(/!\[\[([^\]\n]+)\]\]/g)) {
		const target = (match[1] ?? "").split("|")[0]?.split("#")[0]?.trim() ?? "";
		if (target && isImageHref(target)) {
			push(match.index, { kind: "wiki-image-link", href: target });
		}
	}
	for (const match of markdown.matchAll(/!\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
		push(match.index, imageRefFromHref(markdownImageHref(match[1] ?? "")));
	}
	for (const match of markdown.matchAll(/<img\b[^>]*\bsrc=(["'])(.*?)\1[^>]*>/gi)) {
		push(match.index, imageRefFromHref((match[2] ?? "").trim()));
	}
	const definitions = referenceImageDefinitions(markdown);
	for (const match of markdown.matchAll(/!\[[^\]\n]*\]\[([^\]\n]+)\]/g)) {
		const href = definitions.get((match[1] ?? "").trim().toLowerCase());
		push(match.index, href ? imageRefFromHref(href) : null);
	}
	for (const match of markdown.matchAll(/https?:\/\/[^\s<>)"]+/gi)) {
		const href = (match[0] ?? "").trim();
		if (isImageHref(href)) push(match.index, { kind: "direct", src: href });
	}

	candidates.sort((left, right) => left.index - right.index);
	return candidates[0]?.ref ?? null;
}

export function noteScanQueryOptions(notePath: string) {
	return queryOptions({
		queryKey: navigationQueryKeys.noteScan(notePath),
		queryFn: async ({ signal }) => {
			const doc = await runLimitedNoteRead(
				() =>
					invoke("space_read_text_preview", {
						path: notePath,
						max_bytes: NOTE_SCAN_MAX_BYTES,
					}),
				signal,
			);
			return { imageRef: extractFirstImageRef(doc.text), firstUrl: extractFirstUrl(doc.text) };
		},
		staleTime: NAVIGATION_STALE_TIME_MS,
		retry: false,
	});
}

async function loadLinkedImage(
	notePath: string,
	imageRef: Exclude<NoteImageRef, { kind: "direct" }>,
	signal: AbortSignal,
): Promise<string> {
	return runLimitedNoteRead(async () => {
		const relPath =
			imageRef.kind === "wiki-image-link"
				? await invoke("space_resolve_image_wikilink", { target: imageRef.href })
				: await invoke("space_resolve_markdown_link", {
						href: imageRef.href,
						sourcePath: notePath,
					});
		if (!relPath) return "";
		const image = await invoke("space_read_binary_preview", {
			path: relPath,
			max_bytes: NOTE_THUMBNAIL_MAX_BYTES,
		});
		return image.truncated ? "" : image.data_url;
	}, signal);
}

export function noteLinkedImageQueryOptions(
	notePath: string,
	imageRef: Exclude<NoteImageRef, { kind: "direct" }> | null,
) {
	return queryOptions({
		queryKey: [...navigationQueryKeys.noteScan(notePath), "image", imageRef?.kind, imageRef?.href],
		queryFn: imageRef ? ({ signal }) => loadLinkedImage(notePath, imageRef, signal) : skipToken,
		staleTime: NAVIGATION_STALE_TIME_MS,
		gcTime: NOTE_IMAGE_GC_TIME_MS,
		retry: false,
	});
}
