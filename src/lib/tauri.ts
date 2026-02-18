import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export type {
	CanvasEdge,
	CanvasNode,
	CanvasNodeData,
	FileCanvasNode,
	FileNodeData,
	FolderCanvasNode,
	FolderNodeData,
	FrameCanvasNode,
	FrameNodeData,
	LinkCanvasNode,
	LinkNodeData,
	NoteCanvasNode,
	NoteNodeData,
	TextCanvasNode,
	TextNodeData,
} from "./canvasFlowTypes";
export {
	isFileNode,
	isFolderNode,
	isFrameNode,
	isLinkNode,
	isNoteNode,
	isTextNode,
} from "./canvasFlowTypes";

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

export interface RecentEntry {
	rel_path: string;
	name: string;
	is_markdown: boolean;
	mtime_ms: number;
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

export interface OpenOrCreateTextResult {
	created: boolean;
	mtime_ms: number;
}

export interface TextFileDocBatch {
	rel_path: string;
	text: string | null;
	etag: string | null;
	mtime_ms: number;
	error: string | null;
}

export interface TextFilePreviewDoc {
	rel_path: string;
	text: string;
	mtime_ms: number;
	truncated: boolean;
	bytes_read: number;
	total_bytes: number;
}

export interface BinaryFilePreviewDoc {
	rel_path: string;
	mime: string;
	data_url: string;
	truncated: boolean;
	bytes_read: number;
	total_bytes: number;
	mtime_ms: number;
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

export interface SearchResult {
	id: string;
	title: string;
	snippet: string;
	score: number;
}

export interface SearchAdvancedRequest {
	query?: string | null;
	tags?: string[];
	title_only?: boolean;
	tag_only?: boolean;
	limit?: number | null;
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

export interface IndexNotePreview {
	id: string;
	title: string;
	preview: string;
}

export interface ViewNotePreview {
	id: string;
	title: string;
	content: string;
}

export interface TaskDateInfo {
	scheduled_date: string;
	due_date: string;
}

export interface LinkSuggestionItem {
	path: string;
	title: string;
	insert_text: string;
}

export interface AiContextAttachment {
	kind: "folder" | "file";
	path: string;
	label?: string | null;
}

export interface AiContextIndexItem {
	path: string;
	label: string;
}

export interface AiContextIndexResponse {
	folders: AiContextIndexItem[];
	files: AiContextIndexItem[];
}

export interface AiContextManifestItem {
	kind: string;
	label: string;
	chars: number;
	est_tokens: number;
	truncated: boolean;
}

export interface AiContextManifestResponse {
	items: AiContextManifestItem[];
	total_chars: number;
	est_tokens: number;
}

export interface AiContextBuildResponse {
	payload: string;
	manifest: AiContextManifestResponse;
	resolved_paths: string[];
}

export interface FolderViewFolder {
	dir_rel_path: string;
	name: string;
}

export interface FolderViewData {
	files: FsEntry[];
	subfolders: FolderViewFolder[];
	note_previews: ViewNotePreview[];
}

export type TaskBucket = "inbox" | "today" | "upcoming";

export interface TaskItem {
	task_id: string;
	note_id: string;
	note_title: string;
	note_path: string;
	line_start: number;
	raw_text: string;
	checked: boolean;
	status: string;
	priority: number;
	due_date: string | null;
	scheduled_date: string | null;
	section: string | null;
	note_updated: string;
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

export type AiAssistantMode = "chat" | "create";

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
	role: "system" | "user" | "assistant";
	content: string;
}

export interface AiChatStartResult {
	job_id: string;
}

export interface AiModel {
	id: string;
	name: string;
	context_length: number | null;
	description: string | null;
	input_modalities: string[] | null;
	output_modalities: string[] | null;
	tokenizer: string | null;
	prompt_pricing: string | null;
	completion_pricing: string | null;
	supported_parameters: string[] | null;
	max_completion_tokens: number | null;
}

export interface ProviderSupportEntry {
	display_name: string;
	url: string | null;
	endpoints: Record<string, boolean>;
}

export interface ProviderSupportDocument {
	providers: Record<string, ProviderSupportEntry>;
}

export interface AiChatHistorySummary {
	job_id: string;
	title: string;
	provider: AiProviderKind | null;
	created_at_ms: number;
	cancelled: boolean;
	profile_name: string;
	model: string;
	message_count: number;
	preview: string;
}

export interface AiStoredToolEvent {
	tool: string;
	phase: "call" | "result" | "error";
	at_ms: number;
	call_id?: string | null;
	payload?: unknown;
	error?: string | null;
}

export interface AiChatHistoryDetail {
	messages: AiMessage[];
	tool_events: AiStoredToolEvent[];
}

type CommandDef<Args, Result> = { args: Args; result: Result };

interface TauriCommands {
	greet: CommandDef<{ name: string }, string>;
	ping: CommandDef<void, string>;
	app_info: CommandDef<void, AppInfo>;
	system_fonts_list: CommandDef<void, string[]>;
	system_monospace_fonts_list: CommandDef<void, string[]>;
	vault_create: CommandDef<{ path: string }, VaultInfo>;
	vault_open: CommandDef<{ path: string }, VaultInfo>;
	vault_get_current: CommandDef<void, string | null>;
	vault_close: CommandDef<void, void>;
	vault_list_dir: CommandDef<{ dir?: string | null }, FsEntry[]>;
	vault_list_markdown_files: CommandDef<
		{ dir?: string | null; recursive?: boolean | null; limit?: number | null },
		FsEntry[]
	>;
	vault_list_files: CommandDef<
		{ dir?: string | null; recursive?: boolean | null; limit?: number | null },
		FsEntry[]
	>;
	vault_dir_recent_entries: CommandDef<
		{ dir?: string | null; limit?: number | null },
		RecentEntry[]
	>;
	vault_read_text: CommandDef<{ path: string }, TextFileDoc>;
	vault_read_texts_batch: CommandDef<{ paths: string[] }, TextFileDocBatch[]>;
	vault_read_text_preview: CommandDef<
		{ path: string; max_bytes?: number | null },
		TextFilePreviewDoc
	>;
	vault_read_binary_preview: CommandDef<
		{ path: string; max_bytes?: number | null },
		BinaryFilePreviewDoc
	>;
	vault_write_text: CommandDef<
		{ path: string; text: string; base_mtime_ms?: number | null },
		TextFileWriteResult
	>;
	vault_open_or_create_text: CommandDef<
		{ path: string; text: string },
		OpenOrCreateTextResult
	>;
	vault_create_dir: CommandDef<{ path: string }, void>;
	vault_rename_path: CommandDef<{ from_path: string; to_path: string }, void>;
	vault_delete_path: CommandDef<
		{ path: string; recursive?: boolean | null },
		void
	>;
	vault_resolve_abs_path: CommandDef<{ path: string }, string>;
	vault_relativize_path: CommandDef<{ abs_path: string }, string>;
	vault_resolve_wikilink: CommandDef<{ target: string }, string | null>;
	vault_resolve_markdown_link: CommandDef<
		{ href: string; source_path: string },
		string | null
	>;
	vault_suggest_links: CommandDef<
		{
			request: {
				query: string;
				source_path?: string | null;
				markdown_only?: boolean | null;
				strip_markdown_ext?: boolean | null;
				relative_to_source?: boolean | null;
				limit?: number | null;
			};
		},
		LinkSuggestionItem[]
	>;
	vault_folder_view_data: CommandDef<
		{
			dir?: string | null;
			limit?: number | null;
			recent_limit?: number | null;
		},
		FolderViewData
	>;
	cipher_read_text: CommandDef<{ path: string }, string>;
	cipher_write_text: CommandDef<{ path: string; text: string }, void>;
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

	index_rebuild: CommandDef<void, IndexRebuildResult>;
	index_note_previews_batch: CommandDef<{ ids: string[] }, IndexNotePreview[]>;
	search: CommandDef<{ query: string }, SearchResult[]>;
	search_advanced: CommandDef<
		{ request: SearchAdvancedRequest },
		SearchResult[]
	>;
	search_parse_and_run: CommandDef<
		{ raw_query: string; limit?: number | null },
		SearchResult[]
	>;
	search_view_data: CommandDef<
		{ query: string; limit?: number | null },
		ViewNotePreview[]
	>;
	search_with_tags: CommandDef<
		{ tags: string[]; query?: string | null; limit?: number | null },
		SearchResult[]
	>;
	recent_notes: CommandDef<{ limit?: number | null }, SearchResult[]>;
	tags_list: CommandDef<{ limit?: number | null }, TagCount[]>;
	tag_notes: CommandDef<{ tag: string; limit?: number | null }, SearchResult[]>;
	tag_view_data: CommandDef<
		{ tag: string; limit?: number | null },
		ViewNotePreview[]
	>;
	tasks_query: CommandDef<
		{
			bucket: TaskBucket;
			today: string;
			limit?: number | null;
		},
		TaskItem[]
	>;
	task_set_checked: CommandDef<{ task_id: string; checked: boolean }, void>;
	task_set_dates: CommandDef<
		{
			task_id: string;
			scheduled_date?: string | null;
			due_date?: string | null;
		},
		void
	>;
	task_dates_by_ordinal: CommandDef<
		{ markdown: string; ordinal: number },
		TaskDateInfo | null
	>;
	task_update_by_ordinal: CommandDef<
		{
			markdown: string;
			ordinal: number;
			scheduled_date: string;
			due_date: string;
		},
		string | null
	>;
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
	ai_secret_list: CommandDef<void, string[]>;
	ai_provider_support: CommandDef<void, ProviderSupportDocument>;
	ai_audit_mark: CommandDef<{ job_id: string; outcome: string }, void>;
	ai_chat_start: CommandDef<
		{
			request: {
				profile_id: string;
				messages: AiMessage[];
				thread_id?: string;
				mode: AiAssistantMode;
				context?: string;
				context_manifest?: unknown;
				audit?: boolean;
			};
		},
		AiChatStartResult
	>;
	ai_chat_cancel: CommandDef<{ job_id: string }, void>;
	ai_models_list: CommandDef<{ profile_id: string }, AiModel[]>;
	ai_chat_history_list: CommandDef<
		{ limit?: number | null },
		AiChatHistorySummary[]
	>;
	ai_chat_history_get: CommandDef<{ job_id: string }, AiChatHistoryDetail>;
	ai_context_index: CommandDef<void, AiContextIndexResponse>;
	ai_context_build: CommandDef<
		{
			request: {
				attachments: AiContextAttachment[];
				char_budget?: number | null;
			};
		},
		AiContextBuildResponse
	>;
	ai_context_resolve_paths: CommandDef<
		{ attachments: AiContextAttachment[] },
		string[]
	>;
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

function asInvokePayload(value: unknown): Record<string, unknown> {
	if (value == null) return {};
	if (typeof value !== "object" || Array.isArray(value)) return {};
	return value as Record<string, unknown>;
}

type ArgsTuple<K extends keyof TauriCommands> =
	TauriCommands[K]["args"] extends void ? [] : [TauriCommands[K]["args"]];

export async function invoke<K extends keyof TauriCommands>(
	command: K,
	...args: ArgsTuple<K>
): Promise<TauriCommands[K]["result"]> {
	try {
		const payload = args.length > 0 ? asInvokePayload(args[0]) : {};
		return (await tauriInvoke(command, payload)) as TauriCommands[K]["result"];
	} catch (raw) {
		throw new TauriInvokeError(errorMessage(raw), raw);
	}
}
