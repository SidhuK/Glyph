import { invoke } from "../tauri";
import type { ViewDoc } from "../views";
import type {
	CanvasLibraryIndexDoc,
	CanvasLibraryMeta,
	CreateCanvasInput,
	CreateCanvasResult,
} from "./types";

const INDEX_PATH = "Canvases/index.json";

function canvasPath(id: string): string {
	return `Canvases/${id}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object";
}

function parseCanvasMeta(value: unknown): CanvasLibraryMeta | null {
	if (!isRecord(value)) return null;
	if (typeof value.id !== "string") return null;
	if (typeof value.title !== "string") return null;
	if (typeof value.created_at_ms !== "number") return null;
	if (typeof value.updated_at_ms !== "number") return null;
	if (value.source !== "manual" && value.source !== "ai") return null;
	return {
		id: value.id,
		title: value.title,
		created_at_ms: value.created_at_ms,
		updated_at_ms: value.updated_at_ms,
		source: value.source,
	};
}

function parseIndex(raw: string): CanvasLibraryIndexDoc {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) return { schema_version: 1, items: [] };
		if (parsed.schema_version !== 1) return { schema_version: 1, items: [] };
		if (!Array.isArray(parsed.items)) return { schema_version: 1, items: [] };
		const items = parsed.items
			.map((item) => parseCanvasMeta(item))
			.filter((item): item is CanvasLibraryMeta => item != null);
		return { schema_version: 1, items };
	} catch {
		return { schema_version: 1, items: [] };
	}
}

function parseCanvasDoc(raw: string): ViewDoc | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) return null;
		if (parsed.schema_version !== 1) return null;
		if (parsed.kind !== "canvas") return null;
		if (typeof parsed.view_id !== "string") return null;
		if (typeof parsed.selector !== "string") return null;
		if (typeof parsed.title !== "string") return null;
		if (!isRecord(parsed.options)) return null;
		if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges))
			return null;
		return {
			schema_version: 1,
			view_id: parsed.view_id,
			kind: "canvas",
			selector: parsed.selector,
			title: parsed.title,
			options: parsed.options,
			nodes: parsed.nodes,
			edges: parsed.edges,
		};
	} catch {
		return null;
	}
}

function buildCanvasDoc(id: string, title: string): ViewDoc {
	return {
		schema_version: 1,
		view_id: `canvas:${id}`,
		kind: "canvas",
		selector: id,
		title,
		options: {},
		nodes: [],
		edges: [],
	};
}

async function readIndex(): Promise<CanvasLibraryIndexDoc> {
	try {
		const raw = await invoke("lattice_read_text", { path: INDEX_PATH });
		return parseIndex(raw);
	} catch {
		return { schema_version: 1, items: [] };
	}
}

async function writeIndex(doc: CanvasLibraryIndexDoc): Promise<void> {
	await invoke("lattice_write_text", {
		path: INDEX_PATH,
		text: JSON.stringify(doc, null, 2),
	});
}

async function migrateLegacyCanvasesIfNeeded(
	index: CanvasLibraryIndexDoc,
): Promise<CanvasLibraryIndexDoc> {
	if (index.items.length > 0) return index;
	try {
		const legacy = await invoke("canvas_list");
		if (!legacy.length) return index;
		const now = Date.now();
		const migrated: CanvasLibraryMeta[] = [];
		for (const item of legacy) {
			const raw = await invoke("canvas_read", { id: item.id }).catch(
				() => null,
			);
			if (!raw) continue;
			const doc: ViewDoc = {
				schema_version: 1,
				view_id: `canvas:${item.id}`,
				kind: "canvas",
				selector: item.id,
				title: raw.title || item.title || "Canvas",
				options: {},
				nodes: raw.nodes,
				edges: raw.edges,
			};
			await invoke("lattice_write_text", {
				path: canvasPath(item.id),
				text: JSON.stringify(doc, null, 2),
			});
			const updatedAt = Date.parse(item.updated);
			const updated = Number.isFinite(updatedAt) ? updatedAt : now;
			migrated.push({
				id: item.id,
				title: doc.title,
				source: "manual",
				created_at_ms: updated,
				updated_at_ms: updated,
			});
		}
		if (!migrated.length) return index;
		const next = { schema_version: 1 as const, items: migrated };
		await writeIndex(next);
		return next;
	} catch {
		return index;
	}
}

export async function listCanvases(): Promise<CanvasLibraryMeta[]> {
	const index = await migrateLegacyCanvasesIfNeeded(await readIndex());
	return [...index.items].sort((a, b) => b.updated_at_ms - a.updated_at_ms);
}

export async function readCanvas(id: string): Promise<ViewDoc | null> {
	try {
		const raw = await invoke("lattice_read_text", { path: canvasPath(id) });
		return parseCanvasDoc(raw);
	} catch {
		return null;
	}
}

export async function createCanvas(
	input: CreateCanvasInput = {},
): Promise<CreateCanvasResult> {
	const now = Date.now();
	const id = crypto.randomUUID();
	const title = input.title?.trim() || "Canvas";
	const source = input.source ?? "manual";
	const doc = buildCanvasDoc(id, title);
	const meta: CanvasLibraryMeta = {
		id,
		title,
		source,
		created_at_ms: now,
		updated_at_ms: now,
	};

	await invoke("lattice_write_text", {
		path: canvasPath(id),
		text: JSON.stringify(doc, null, 2),
	});
	const index = await readIndex();
	const items = index.items.filter((item) => item.id !== id);
	items.push(meta);
	await writeIndex({ schema_version: 1, items });
	return { meta, doc };
}

export async function touchCanvas(id: string, title?: string): Promise<void> {
	const now = Date.now();
	const index = await readIndex();
	const items = index.items.map((item) => {
		if (item.id !== id) return item;
		return {
			...item,
			title: title ?? item.title,
			updated_at_ms: now,
		};
	});
	await writeIndex({ schema_version: 1, items });
}

export async function renameCanvas(id: string, title: string): Promise<void> {
	const nextTitle = title.trim();
	if (!nextTitle) return;
	const doc = await readCanvas(id);
	if (doc) {
		const updated: ViewDoc = { ...doc, title: nextTitle };
		await invoke("lattice_write_text", {
			path: canvasPath(id),
			text: JSON.stringify(updated, null, 2),
		});
	}
	await touchCanvas(id, nextTitle);
}
