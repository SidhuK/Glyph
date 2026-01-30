import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type { Edge, Node } from "@xyflow/react";

export interface AppInfo {
	name: string;
	version: string;
	identifier: string;
}

export interface VaultInfo {
	root: string;
	schema_version: number;
}

export interface NoteMeta {
	id: string;
	title: string;
	created: string;
	updated: string;
}

export interface NoteDoc {
	meta: NoteMeta;
	markdown: string;
	etag: string;
	mtime_ms: number;
}

export interface NoteWriteResult {
	meta: NoteMeta;
	etag: string;
	mtime_ms: number;
}

export interface AttachmentResult {
	asset_rel_path: string;
	markdown: string;
}

export interface CanvasMeta {
	id: string;
	title: string;
	updated: string;
}

export type CanvasNode = Node<Record<string, unknown>>;
export type CanvasEdge = Edge<Record<string, unknown>>;

export interface CanvasDoc {
	version: number;
	id: string;
	title: string;
	updated: string;
	nodes: CanvasNode[];
	edges: CanvasEdge[];
}

export interface SearchResult {
	id: string;
	title: string;
	snippet: string;
	score: number;
}

export interface BacklinkItem {
	id: string;
	title: string;
	updated: string;
}

export interface IndexRebuildResult {
	indexed: number;
}

export interface LinkPreview {
	url: string;
	hostname: string;
	title: string;
	description: string;
	image_url: string | null;
	image_cache_rel_path: string | null;
	fetched_at_ms: number;
	ok: boolean;
}

export type AiProviderKind = "openai" | "openai_compat";

export interface AiProfile {
	id: string;
	name: string;
	provider: AiProviderKind;
	model: string;
	base_url: string | null;
}

export interface AiMessage {
	role: string;
	content: string;
}

export interface AiChatStartResult {
	job_id: string;
}

type CommandDef<Args, Result> = { args: Args; result: Result };

interface TauriCommands {
	greet: CommandDef<{ name: string }, string>;
	ping: CommandDef<void, string>;
	app_info: CommandDef<void, AppInfo>;
	vault_create: CommandDef<{ path: string }, VaultInfo>;
	vault_open: CommandDef<{ path: string }, VaultInfo>;
	vault_get_current: CommandDef<void, string | null>;
	notes_list: CommandDef<void, NoteMeta[]>;
	note_create: CommandDef<{ title: string }, NoteMeta>;
	note_read: CommandDef<{ id: string }, NoteDoc>;
	note_write: CommandDef<
		{ id: string; markdown: string; base_etag?: string | null },
		NoteWriteResult
	>;
	note_delete: CommandDef<{ id: string }, void>;
	note_attach_file: CommandDef<
		{ note_id: string; source_path: string },
		AttachmentResult
	>;

	canvas_list: CommandDef<void, CanvasMeta[]>;
	canvas_create: CommandDef<{ title: string }, CanvasMeta>;
	canvas_read: CommandDef<{ id: string }, CanvasDoc>;
	canvas_write: CommandDef<{ doc: Omit<CanvasDoc, "updated"> }, CanvasDoc>;

	index_rebuild: CommandDef<void, IndexRebuildResult>;
	search: CommandDef<{ query: string }, SearchResult[]>;
	backlinks: CommandDef<{ note_id: string }, BacklinkItem[]>;
	link_preview: CommandDef<{ url: string; force?: boolean }, LinkPreview>;

	ai_profiles_list: CommandDef<void, AiProfile[]>;
	ai_active_profile_get: CommandDef<void, string | null>;
	ai_active_profile_set: CommandDef<{ id: string | null }, void>;
	ai_profile_upsert: CommandDef<{ profile: AiProfile }, AiProfile>;
	ai_profile_delete: CommandDef<{ id: string }, void>;
	ai_secret_set: CommandDef<{ profile_id: string; api_key: string }, void>;
	ai_secret_clear: CommandDef<{ profile_id: string }, void>;
	ai_chat_start: CommandDef<
		{
			request: { profile_id: string; messages: AiMessage[]; context?: string };
		},
		AiChatStartResult
	>;
	ai_chat_cancel: CommandDef<{ job_id: string }, void>;
}

export class TauriInvokeError extends Error {
	raw: unknown;

	constructor(message: string, raw: unknown) {
		super(message);
		this.name = "TauriInvokeError";
		this.raw = raw;
	}
}

function errorMessage(raw: unknown): string {
	if (raw instanceof Error) return raw.message;
	if (typeof raw === "string") return raw;
	if (raw && typeof raw === "object") {
		const obj = raw as { message?: unknown; error?: unknown };
		const maybeMessage = obj.message;
		if (typeof maybeMessage === "string") return maybeMessage;
		const maybeError = obj.error;
		if (typeof maybeError === "string") return maybeError;
	}
	return "Unknown error";
}

type ArgsTuple<K extends keyof TauriCommands> =
	TauriCommands[K]["args"] extends void ? [] : [TauriCommands[K]["args"]];

export async function invoke<K extends keyof TauriCommands>(
	command: K,
	...args: ArgsTuple<K>
): Promise<TauriCommands[K]["result"]> {
	try {
		const payload = (args[0] ?? {}) as Record<string, unknown>;
		return (await tauriInvoke(
			command as string,
			payload,
		)) as TauriCommands[K]["result"];
	} catch (raw) {
		throw new TauriInvokeError(errorMessage(raw), raw);
	}
}
