import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type LinkPreview, TauriInvokeError, invoke } from "../../lib/tauri";
import type { CanvasDocLike } from "../CanvasPane";

export type SelectedCanvasNode = {
	id: string;
	type: string | null;
	data: Record<string, unknown> | null;
};

type ContextSpec = {
	neighborDepth: 0 | 1 | 2;
	includeNoteContents: boolean;
	includeLinkPreviewText: boolean;
	includeActiveNote: boolean;
	includeSelectedNodes: boolean;
	charBudget: number;
};

type ContextManifestItem = {
	kind: string;
	label: string;
	chars: number;
	estTokens: number;
	truncated: boolean;
};

export type ContextManifest = {
	spec: ContextSpec;
	items: ContextManifestItem[];
	totalChars: number;
	estTokens: number;
};

function errMessage(err: unknown): string {
	if (err instanceof TauriInvokeError) return err.message;
	if (err instanceof Error) return err.message;
	return String(err);
}

function clampInt(n: number, min: number, max: number): number {
	if (!Number.isFinite(n)) return min;
	return Math.max(min, Math.min(max, Math.floor(n)));
}

function estimateTokens(chars: number): number {
	return Math.ceil(chars / 4);
}

function isUuid(id: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		id,
	);
}

function truncateWithNotice(
	text: string,
	maxChars: number,
): { text: string; truncated: boolean } {
	if (maxChars <= 0) return { text: "", truncated: true };
	if (text.length <= maxChars) return { text, truncated: false };
	const suffix = "\n…(truncated)";
	const keep = Math.max(0, maxChars - suffix.length);
	return { text: `${text.slice(0, keep)}${suffix}`, truncated: true };
}

export function useAiContext({
	activeNoteId,
	activeNoteTitle,
	activeNoteMarkdown,
	selectedCanvasNodes,
	canvasDoc,
}: {
	activeNoteId: string | null;
	activeNoteTitle: string | null;
	activeNoteMarkdown?: string | null;
	selectedCanvasNodes: SelectedCanvasNode[];
	canvasDoc: CanvasDocLike | null;
}) {
	const [includeActiveNote, setIncludeActiveNote] = useState(true);
	const [includeSelectedNodes, setIncludeSelectedNodes] = useState(true);
	const [includeNoteContents, setIncludeNoteContents] = useState(true);
	const [includeLinkPreviewText, setIncludeLinkPreviewText] = useState(true);
	const [neighborDepth, setNeighborDepth] = useState<0 | 1 | 2>(0);
	const [charBudget, setCharBudget] = useState(8000);

	const [payloadPreview, setPayloadPreview] = useState("");
	const [payloadApproved, setPayloadApproved] = useState(false);
	const [payloadManifest, setPayloadManifest] =
		useState<ContextManifest | null>(null);
	const [payloadError, setPayloadError] = useState("");

	const noteCacheRef = useRef<Map<string, { title: string; markdown: string }>>(
		new Map(),
	);
	const linkPreviewCacheRef = useRef<Map<string, LinkPreview>>(new Map());

	const getNote = useCallback(async (noteId: string) => {
		const cached = noteCacheRef.current.get(noteId);
		if (cached) return cached;
		const next = isUuid(noteId)
			? await (async () => {
					const doc = await invoke("note_read", { id: noteId });
					return { title: doc.meta.title, markdown: doc.markdown };
				})()
			: await (async () => {
					const doc = await invoke("vault_read_text", { path: noteId });
					const title = noteId.split("/").pop() || noteId;
					return { title, markdown: doc.text };
				})();
		noteCacheRef.current.set(noteId, next);
		return next;
	}, []);

	const getLinkPreview = useCallback(async (url: string) => {
		const cached = linkPreviewCacheRef.current.get(url);
		if (cached) return cached;
		try {
			const preview = await invoke("link_preview", { url });
			linkPreviewCacheRef.current.set(url, preview);
			return preview;
		} catch {
			return null;
		}
	}, []);

	const contextSpec = useMemo<ContextSpec>(
		() => ({
			neighborDepth,
			includeNoteContents,
			includeLinkPreviewText,
			includeActiveNote,
			includeSelectedNodes,
			charBudget: clampInt(charBudget, 200, 200_000),
		}),
		[
			charBudget,
			includeActiveNote,
			includeLinkPreviewText,
			includeNoteContents,
			includeSelectedNodes,
			neighborDepth,
		],
	);

	const payloadInvalidationKey = useMemo(() => {
		const selectedIds = selectedCanvasNodes.map((n) => n.id).join(",");
		const noteKey = activeNoteId ? `${activeNoteId}` : "";
		const canvasKey = canvasDoc?.id ?? "";
		return JSON.stringify({
			selectedIds,
			noteKey,
			canvasKey,
			contextSpec,
		});
	}, [activeNoteId, canvasDoc?.id, contextSpec, selectedCanvasNodes]);

	useEffect(() => {
		void payloadInvalidationKey;
		setPayloadApproved(false);
		setPayloadError("");
	}, [payloadInvalidationKey]);

	const buildPayload = useCallback(async () => {
		setPayloadError("");
		setPayloadApproved(false);

		try {
			const items: ContextManifestItem[] = [];
			const parts: string[] = [];
			let remaining = contextSpec.charBudget;

			const pushItem = (kind: string, label: string, text: string) => {
				if (!text.trim()) return;
				const { text: clipped, truncated } = truncateWithNotice(
					text.trim(),
					remaining,
				);
				if (!clipped.trim()) return;
				parts.push(clipped);
				const chars = clipped.length;
				items.push({
					kind,
					label,
					chars,
					estTokens: estimateTokens(chars),
					truncated,
				});
				remaining = Math.max(0, remaining - chars);
			};

			const splitFrontmatter = (md: string): string => {
				if (md.startsWith("---\n")) {
					const idx = md.indexOf("\n---\n", 4);
					if (idx !== -1) return md.slice(idx + "\n---\n".length);
				}
				if (md.startsWith("---\r\n")) {
					const idx = md.indexOf("\r\n---\r\n", 5);
					if (idx !== -1) return md.slice(idx + "\r\n---\r\n".length);
				}
				return md;
			};

			const noteExcerpt = (md: string, budget: number): string => {
				const body = splitFrontmatter(md).trim();
				if (!body) return "";
				const lines = body.split("\n");
				const headings: string[] = [];
				for (const line of lines) {
					if (line.startsWith("#")) headings.push(line.trim());
					if (headings.length >= 16) break;
				}
				const headingBlock = headings.length
					? `Headings:\n${headings.map((h) => `- ${h}`).join("\n")}\n\n`
					: "";
				const remainderBudget = Math.max(0, budget - headingBlock.length);
				const excerpt = body.slice(0, remainderBudget);
				return `${headingBlock}${excerpt}`.trim();
			};

			if (contextSpec.includeActiveNote && activeNoteId) {
				const note =
					typeof activeNoteMarkdown === "string" && activeNoteMarkdown.length
						? {
								title: activeNoteTitle || activeNoteId,
								markdown: activeNoteMarkdown,
							}
						: await getNote(activeNoteId);
				const title = note.title ?? activeNoteTitle ?? "";
				const md = note.markdown ?? "";
				const header =
					`# Active Note\nid: ${activeNoteId}\ntitle: ${title}`.trim();
				const content =
					contextSpec.includeNoteContents && md
						? `\n\n${noteExcerpt(md, remaining)}`
						: "";
				pushItem("active_note", title || activeNoteId, `${header}${content}`);
			}

			if (contextSpec.includeSelectedNodes && selectedCanvasNodes.length) {
				const selectedIds = selectedCanvasNodes.map((n) => n.id);
				const nodesById = new Map(
					(canvasDoc?.nodes ?? []).map((n) => [n.id, n] as const),
				);
				const edges = canvasDoc?.edges ?? [];
				const adj = new Map<string, Set<string>>();
				const addAdj = (a: string, b: string) => {
					if (!a || !b) return;
					const set = adj.get(a) ?? new Set<string>();
					set.add(b);
					adj.set(a, set);
				};
				for (const e of edges) {
					addAdj(e.source, e.target);
					addAdj(e.target, e.source);
				}

				const included = new Set<string>(selectedIds);
				let frontier = selectedIds.slice();
				const ordered = selectedIds.slice();
				for (let depth = 0; depth < contextSpec.neighborDepth; depth++) {
					const next: string[] = [];
					for (const id of frontier) {
						const neighbors = adj.get(id);
						if (!neighbors) continue;
						for (const nb of neighbors) {
							if (included.has(nb)) continue;
							included.add(nb);
							next.push(nb);
						}
					}
					ordered.push(...next);
					frontier = next;
				}

				for (const nodeId of ordered) {
					if (!remaining) break;
					const fromDoc = nodesById.get(nodeId);
					const fallback =
						selectedCanvasNodes.find((n) => n.id === nodeId) ?? null;
					const type = fromDoc?.type ?? fallback?.type ?? "unknown";
					const data =
						(fromDoc?.data as Record<string, unknown> | null | undefined) ??
						fallback?.data ??
						{};

					if (type === "note") {
						const noteId =
							typeof data.noteId === "string"
								? data.noteId
								: typeof data.note_id === "string"
									? data.note_id
									: "";
						const cachedTitle =
							typeof data.title === "string" ? data.title : "Note";
						const note = noteId ? await getNote(noteId) : null;
						const title = note?.title ?? cachedTitle;
						const header =
							`# Canvas Note Node\nnodeId: ${nodeId}\nnoteId: ${noteId}\ntitle: ${title}`.trim();
						const content =
							contextSpec.includeNoteContents && note?.markdown
								? `\n\n${noteExcerpt(note.markdown, remaining)}`
								: "";
						pushItem("canvas_note", title, `${header}${content}`);
						continue;
					}

					if (type === "link") {
						const url = typeof data.url === "string" ? data.url : "";
						const preview =
							(data.preview as LinkPreview | null | undefined) ??
							(url ? await getLinkPreview(url) : null);
						const title = preview?.title ? preview.title : url || "Link";
						const header =
							`# Canvas Link Node\nnodeId: ${nodeId}\nurl: ${url}\ntitle: ${title}`.trim();
						const desc =
							contextSpec.includeLinkPreviewText && preview?.description
								? `\n\ndescription: ${preview.description}`
								: "";
						pushItem("canvas_link", title, `${header}${desc}`);
						continue;
					}

					if (type === "text") {
						const text = typeof data.text === "string" ? data.text : "";
						const header = `# Canvas Text Node\nnodeId: ${nodeId}`.trim();
						const content = text ? `\n\n${text}` : "";
						pushItem("canvas_text", "Text node", `${header}${content}`);
						continue;
					}

					if (type === "frame") {
						const title = typeof data.title === "string" ? data.title : "Frame";
						const header =
							`# Canvas Frame\nnodeId: ${nodeId}\ntitle: ${title}`.trim();
						pushItem("canvas_frame", title, header);
						continue;
					}

					pushItem(
						"canvas_node",
						`${type}`,
						`# Canvas Node\nnodeId: ${nodeId}\ntype: ${type}`,
					);
				}
			}

			const payload = parts.join("\n\n---\n\n").trim();
			const totalChars = payload.length;
			const manifest: ContextManifest = {
				spec: contextSpec,
				items,
				totalChars,
				estTokens: estimateTokens(totalChars),
			};
			setPayloadPreview(payload);
			setPayloadManifest(manifest);
		} catch (e) {
			setPayloadError(errMessage(e));
		}
	}, [
		activeNoteId,
		activeNoteMarkdown,
		activeNoteTitle,
		canvasDoc,
		contextSpec,
		getLinkPreview,
		getNote,
		selectedCanvasNodes,
	]);

	return {
		contextSpec,
		includeActiveNote,
		setIncludeActiveNote,
		includeSelectedNodes,
		setIncludeSelectedNodes,
		includeNoteContents,
		setIncludeNoteContents,
		includeLinkPreviewText,
		setIncludeLinkPreviewText,
		neighborDepth,
		setNeighborDepth,
		charBudget,
		setCharBudget,
		payloadPreview,
		payloadManifest,
		payloadApproved,
		setPayloadApproved,
		payloadError,
		buildPayload,
	};
}
