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

export interface FsEntry {
	name: string;
	rel_path: string;
	kind: "dir" | "file";
	is_markdown: boolean;
}

export interface TextFileDoc {
	rel_path: string;
	text: string;
	etag: string;
	mtime_ms: number;
}

export interface TextFileWriteResult {
	etag: string;
	mtime_ms: number;
}

export interface TextFileDocBatch {
	rel_path: string;
	text: string | null;
	etag: string | null;
	mtime_ms: number;
	error: string | null;
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

export interface TagCount {
	tag: string;
	count: number;
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

export type AiProviderKind =
	| "openai"
	| "openai_compat"
	| "openrouter"
	| "anthropic"
	| "gemini"
	| "ollama";

export interface AiHeader {
	key: string;
	value: string;
}

export interface AiProfile {
	id: string;
	name: string;
	provider: AiProviderKind;
	model: string;
	base_url: string | null;
	headers: AiHeader[];
	allow_private_hosts: boolean;
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
	vault_list_dir: CommandDef<{ dir?: string | null }, FsEntry[]>;
	vault_list_markdown_files: CommandDef<
		{ dir?: string | null; recursive?: boolean | null; limit?: number | null },
		FsEntry[]
	>;
	vault_list_files: CommandDef<
		{ dir?: string | null; recursive?: boolean | null; limit?: number | null },
		FsEntry[]
	>;
	vault_read_text: CommandDef<{ path: string }, TextFileDoc>;
	vault_read_texts_batch: CommandDef<{ paths: string[] }, TextFileDocBatch[]>;
	vault_write_text: CommandDef<
		{ path: string; text: string; base_mtime_ms?: number | null },
		TextFileWriteResult
	>;
	vault_relativize_path: CommandDef<{ abs_path: string }, string>;
	tether_read_text: CommandDef<{ path: string }, string>;
	tether_write_text: CommandDef<{ path: string; text: string }, void>;
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
	tags_list: CommandDef<{ limit?: number | null }, TagCount[]>;
	tag_notes: CommandDef<{ tag: string; limit?: number | null }, SearchResult[]>;
	backlinks: CommandDef<{ note_id: string }, BacklinkItem[]>;
	link_preview: CommandDef<{ url: string; force?: boolean }, LinkPreview>;

	ai_profiles_list: CommandDef<void, AiProfile[]>;
	ai_active_profile_get: CommandDef<void, string | null>;
	ai_active_profile_set: CommandDef<{ id: string | null }, void>;
	ai_profile_upsert: CommandDef<{ profile: AiProfile }, AiProfile>;
	ai_profile_delete: CommandDef<{ id: string }, void>;
	ai_secret_set: CommandDef<{ profile_id: string; api_key: string }, void>;
	ai_secret_clear: CommandDef<{ profile_id: string }, void>;
	ai_secret_status: CommandDef<{ profile_id: string }, boolean>;
	ai_audit_mark: CommandDef<{ job_id: string; outcome: string }, void>;
	ai_chat_start: CommandDef<
		{
			request: {
				profile_id: string;
				messages: AiMessage[];
				context?: string;
				context_manifest?: unknown;
				audit?: boolean;
			};
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
