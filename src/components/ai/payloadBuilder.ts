import type { LinkPreview } from "../../lib/tauri";
import type { CanvasDocLike } from "../CanvasPane";
import type {
	ContextManifest,
	ContextManifestItem,
	ContextSpec,
	SelectedCanvasNode,
} from "./types";
import { estimateTokens, truncateWithNotice } from "./utils";

export interface PayloadBuilderDeps {
	getNote: (noteId: string) => Promise<{ title: string; markdown: string }>;
	getLinkPreview: (url: string) => Promise<LinkPreview | null>;
}

export interface PayloadBuilderParams {
	contextSpec: ContextSpec;
	activeNoteId: string | null;
	activeNoteTitle: string | null;
	activeNoteMarkdown?: string | null;
	selectedCanvasNodes: SelectedCanvasNode[];
	canvasDoc: CanvasDocLike | null;
}

export interface PayloadBuilderResult {
	payload: string;
	manifest: ContextManifest;
}

function splitFrontmatter(md: string): string {
	if (md.startsWith("---\n")) {
		const idx = md.indexOf("\n---\n", 4);
		if (idx !== -1) return md.slice(idx + "\n---\n".length);
	}
	if (md.startsWith("---\r\n")) {
		const idx = md.indexOf("\r\n---\r\n", 5);
		if (idx !== -1) return md.slice(idx + "\r\n---\r\n".length);
	}
	return md;
}

function noteExcerpt(md: string, budget: number): string {
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
}

export async function buildContextPayload(
	params: PayloadBuilderParams,
	deps: PayloadBuilderDeps,
): Promise<PayloadBuilderResult> {
	const {
		contextSpec,
		activeNoteId,
		activeNoteTitle,
		activeNoteMarkdown,
		selectedCanvasNodes,
		canvasDoc,
	} = params;
	const { getNote, getLinkPreview } = deps;

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
		const header = `# Active Note\nid: ${activeNoteId}\ntitle: ${title}`.trim();
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
			const fallback = selectedCanvasNodes.find((n) => n.id === nodeId) ?? null;
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

	return { payload, manifest };
}
