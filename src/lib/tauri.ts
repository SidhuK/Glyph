import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export interface AppInfo {
	name: string;
	version: string;
	identifier: string;
}

export interface SpaceInfo {
	root: string;
	schema_version: number;
}

export interface FsEntry {
	name: string;
	rel_path: string;
	kind: "dir" | "file";
	is_markdown: boolean;
}

export interface FileTreeAppearance {
	color?: string | null;
	icon?: string | null;
}

export type PinnedFiles = string[];

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

export interface SavedPastedImage {
	asset_rel_path: string;
	href: string;
	markdown: string;
}

export type AttachmentStorageMode =
	| "space-root"
	| "specific-folder"
	| "note-folder";

export interface NoteProperty {
	key: string;
	kind: string;
	value_text: string | null;
	value_bool: boolean | null;
	value_list: string[];
}

export interface DatabaseSource {
	kind: "all_notes" | "folder" | "tag" | "search";
	value: string;
	recursive: boolean;
}

export interface DatabaseNewNoteConfig {
	folder: string;
}

export interface DatabaseViewState {
	layout: "table" | "board";
	board_group_by?: string | null;
	board_lane_colors?: Record<string, string>;
	board_lane_order?: Record<string, string[]>;
}

export interface DatabaseColumn {
	id: string;
	type:
		| "title"
		| "tags"
		| "path"
		| "folder"
		| "created"
		| "updated"
		| "linked_notes"
		| "property";
	label: string;
	icon?: string | null;
	width?: number | null;
	visible: boolean;
	property_key?: string | null;
	property_kind?: string | null;
}

export interface DatabaseSort {
	column_id: string;
	direction: "asc" | "desc";
}

export interface DatabaseFilter {
	column_id: string;
	operator:
		| "equals"
		| "not_equals"
		| "contains"
		| "not_contains"
		| "starts_with"
		| "ends_with"
		| "is_empty"
		| "is_not_empty"
		| "is_true"
		| "is_false"
		| "tags_contains"
		| "any_of"
		| "none_of"
		| "within_last_7_days";
	value_text?: string | null;
	value_bool?: boolean | null;
	value_list: string[];
}

export interface DatabaseConfig {
	source: DatabaseSource;
	new_note: DatabaseNewNoteConfig;
	view: DatabaseViewState;
	columns: DatabaseColumn[];
	sorts: DatabaseSort[];
	filters: DatabaseFilter[];
}

export interface DatabaseCellValue {
	kind: string;
	value_text?: string | null;
	value_bool?: boolean | null;
	value_list: string[];
}

export interface DatabaseRow {
	note_path: string;
	title: string;
	folder?: string;
	created: string;
	updated: string;
	preview?: string;
	tags: string[];
	linked_notes?: string[];
	properties: Record<string, DatabaseCellValue>;
}

export interface WorkspaceDatabaseGrouping {
	column_id: string;
	ascending: boolean;
}

export interface WorkspaceDatabaseView {
	id: string;
	name: string;
	layout: "table" | "board";
	icon?: string | null;
	color?: string | null;
	columns: DatabaseColumn[];
	sorts: DatabaseSort[];
	filters: DatabaseFilter[];
	grouping?: WorkspaceDatabaseGrouping | null;
	board_lane_colors?: Record<string, string>;
	board_lane_order?: Record<string, string[]>;
	created_at: string;
	updated_at: string;
}

export interface WorkspaceDatabaseSchemaField {
	id: string;
	label: string;
	kind: string;
	property_key?: string | null;
	relation_database_id?: string | null;
}

export interface WorkspaceDatabaseDefinition {
	id: string;
	name: string;
	icon?: string | null;
	color?: string | null;
	is_system?: boolean;
	source: {
		kind: "all_notes" | "folder" | "tag" | "search";
		value: string;
		recursive: boolean;
	};
	new_note: DatabaseNewNoteConfig;
	schema: WorkspaceDatabaseSchemaField[];
	views: WorkspaceDatabaseView[];
	created_at: string;
	updated_at: string;
}

export interface WorkspaceDatabaseSummary {
	id: string;
	name: string;
	icon?: string | null;
	color?: string | null;
	is_system?: boolean;
	view_count: number;
}

export interface WorkspaceDatabaseDocument {
	database: WorkspaceDatabaseDefinition;
	available_properties: DatabasePropertyOption[];
}

export interface WorkspaceDatabaseQueryResult {
	rows: DatabaseRow[];
	available_properties: DatabasePropertyOption[];
	total_count: number;
	next_offset?: number | null;
	truncated: boolean;
}

export interface WorkspaceDatabasePreviewContext {
	note_path: string;
	title: string;
	markdown: string;
	created: string;
	updated: string;
	word_count: number;
	character_count: number;
	line_count: number;
	reading_time_minutes: number;
	backlinks: string[];
}

export interface DatabasePropertyOption {
	key: string;
	kind: string;
	count: number;
}

export interface DatabaseLoadResult {
	config: DatabaseConfig;
	rows: DatabaseRow[];
	available_properties: DatabasePropertyOption[];
	truncated: boolean;
	total_loaded: number;
}

export interface DatabaseCreateRowResult {
	note_path: string;
	row: DatabaseRow;
}

export interface SearchResult {
	id: string;
	title: string;
	snippet: string;
	score: number;
}

export interface AllDocsItem {
	note_path: string;
	title: string;
	preview: string;
	updated: string;
	created: string;
	tags: string[];
}

export interface SearchAdvancedRequest {
	query?: string | null;
	tags?: string[];
	people?: string[];
	title_only?: boolean;
	tag_only?: boolean;
	limit?: number | null;
}

export interface BacklinkItem {
	id: string;
	title: string;
	updated: string;
}

export interface LocalGraphNode {
	id: string;
	title: string;
	is_center: boolean;
}

export interface LocalGraphEdge {
	source: string;
	target: string;
}

export interface LocalNoteGraph {
	center: LocalGraphNode;
	nodes: LocalGraphNode[];
	edges: LocalGraphEdge[];
}

export interface TagCount {
	tag: string;
	direct_count: number;
	total_count: number;
	depth: number;
	is_explicit: boolean;
}

export interface PersonCount {
	handle: string;
	count: number;
}

export interface DirChildSummary {
	dir_rel_path: string;
	name: string;
	total_files_recursive: number;
	total_markdown_recursive: number;
	truncated: boolean;
}

export interface IndexRebuildResult {
	indexed: number;
}

export interface TaskDateInfo {
	scheduled_date: string;
	due_date: string;
}

export interface NoteTaskSummary {
	total_count: number;
	completed_count: number;
	open_count: number;
}

export interface NoteTaskSummaryItem extends NoteTaskSummary {
	note_path: string;
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

export interface CalendarDaySummary {
	date: string;
	task_count: number;
	note_activity_count: number;
	has_daily_note: boolean;
	needs_daily_note_setup: boolean;
}

export interface CalendarNoteActivityItem {
	note_id: string;
	note_path: string;
	title: string;
	preview?: string | null;
	tags: string[];
	created: string;
	updated: string;
	created_on_day: boolean;
	edited_on_day: boolean;
}

export interface CalendarDayDetail {
	selected_date: string;
	note_activity: CalendarNoteActivityItem[];
	daily_note_path: string | null;
	has_daily_note: boolean;
	daily_note_configured: boolean;
}

export interface CalendarTaskGroups {
	overdue: TaskItem[];
	for_day: TaskItem[];
	ongoing: TaskItem[];
}

export interface CalendarRangeResponse {
	days: CalendarDaySummary[];
	detail: CalendarDayDetail;
	tasks: CalendarTaskGroups;
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

export type GitSyncRepoMode = "managed_new_repo" | "adopted_existing_repo";
export type GitSyncConflictPolicy = "local_wins" | "remote_wins";
export type GitSyncPhase =
	| "idle"
	| "detecting"
	| "setting_up"
	| "fetching"
	| "committing"
	| "pulling"
	| "pushing"
	| "success"
	| "error";
export type GitSyncRunMode = "manual" | "auto";

export interface GitSyncInclusionSettings {
	include_templates: boolean;
	include_attachments: boolean;
	include_non_markdown_files: boolean;
}

export interface GitSyncConfig {
	enabled: boolean;
	remote_url: string;
	branch: string;
	repo_mode: GitSyncRepoMode;
	conflict_policy: GitSyncConflictPolicy;
	interval_minutes: number;
	inclusions: GitSyncInclusionSettings;
	last_success_at_ms: number | null;
	last_attempted_at_ms: number | null;
	last_error: string | null;
	consecutive_auto_sync_failures: number;
	paused: boolean;
}

export interface GitSyncStatus {
	git_installed: boolean;
	configured: boolean;
	repo_detected: boolean;
	repo_root_matches_space: boolean;
	unsupported_parent_repo: boolean;
	repo_mode: GitSyncRepoMode | null;
	remote_url: string | null;
	branch: string | null;
	enabled: boolean;
	paused: boolean;
	phase: GitSyncPhase;
	is_syncing: boolean;
	interval_minutes: number;
	conflict_policy: GitSyncConflictPolicy;
	inclusions: GitSyncInclusionSettings;
	last_success_at_ms: number | null;
	last_attempted_at_ms: number | null;
	last_error: string | null;
	consecutive_auto_sync_failures: number;
	detected_remote_url: string | null;
	detected_branch: string | null;
	local_change_count: number;
	ahead_count: number;
	behind_count: number;
	preflight_issue: string | null;
	conflict_risk: string | null;
	message: string | null;
}

export interface GitSyncContext {
	templates_folder?: string | null;
	attachment_storage_mode?: AttachmentStorageMode | null;
	attachment_folder?: string | null;
}

export interface GitSyncRunRequest {
	mode: GitSyncRunMode;
	context: GitSyncContext;
}

export interface GitSyncConfigPatch {
	enabled?: boolean;
	conflict_policy?: GitSyncConflictPolicy;
	interval_minutes?: number;
	inclusions?: GitSyncInclusionSettings;
	paused?: boolean;
}

export type LicenseMode =
	| "community_build"
	| "licensed"
	| "trial_active"
	| "trial_expired";

export interface LicenseStatus {
	mode: LicenseMode;
	can_use_app: boolean;
	can_auto_update: boolean;
	is_official_build: boolean;
	purchase_url: string;
	support_url: string;
	trial_started_at_ms: number | null;
	trial_expires_at_ms: number | null;
	trial_remaining_seconds: number | null;
	activated_at_ms: number | null;
	license_key_masked: string | null;
	error_code: string | null;
}

export interface LicenseActivateResult {
	status: LicenseStatus;
}

export type AiProviderKind =
	| "openai"
	| "openai_compat"
	| "openrouter"
	| "anthropic"
	| "gemini"
	| "ollama"
	| "codex_chatgpt";

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
	reasoning_effort?: string | null;
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
	reasoning_effort?: AiReasoningEffortOption[] | null;
	default_reasoning_effort?: string | null;
}

export interface AiReasoningEffortOption {
	effort: string;
	description?: string | null;
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

export interface CodexRateLimitWindow {
	used_percent: number;
	window_duration_mins?: number | null;
	resets_at?: number | null;
}

export interface CodexRateLimitBucket {
	limit_id?: string | null;
	limit_name?: string | null;
	primary?: CodexRateLimitWindow | null;
	secondary?: CodexRateLimitWindow | null;
}

export interface CodexRateLimits {
	buckets: CodexRateLimitBucket[];
}

type CommandDef<Args, Result> = { args: Args; result: Result };

interface TauriCommands {
	greet: CommandDef<{ name: string }, string>;
	ping: CommandDef<void, string>;
	app_info: CommandDef<void, AppInfo>;
	system_fonts_list: CommandDef<void, string[]>;
	system_monospace_fonts_list: CommandDef<void, string[]>;
	set_markdown_menu_visible: CommandDef<{ visible: boolean }, void>;
	license_bootstrap_status: CommandDef<void, LicenseStatus>;
	license_activate: CommandDef<{ license_key: string }, LicenseActivateResult>;
	license_clear_local: CommandDef<void, LicenseActivateResult>;
	space_create: CommandDef<{ path: string }, SpaceInfo>;
	space_open: CommandDef<{ path: string }, SpaceInfo>;
	space_get_current: CommandDef<void, string | null>;
	space_close: CommandDef<void, void>;
	export_write_text: CommandDef<{ abs_path: string; text: string }, void>;
	space_list_dirs: CommandDef<
		{ dir?: string | null; limit?: number | null },
		FsEntry[]
	>;
	space_list_dir: CommandDef<{ dir?: string | null }, FsEntry[]>;
	file_tree_appearance_list: CommandDef<
		void,
		Record<string, FileTreeAppearance>
	>;
	file_tree_appearance_set: CommandDef<
		{ path: string; color?: string | null; icon?: string | null },
		FileTreeAppearance | null
	>;
	file_tree_appearance_rename_path: CommandDef<
		{ from_path: string; to_path: string },
		void
	>;
	file_tree_appearance_delete_path: CommandDef<{ path: string }, void>;
	pinned_files_list: CommandDef<void, PinnedFiles>;
	pinned_files_toggle: CommandDef<{ path: string }, PinnedFiles>;
	pinned_files_rename_path: CommandDef<
		{ from_path: string; to_path: string },
		PinnedFiles
	>;
	pinned_files_delete_path: CommandDef<{ path: string }, PinnedFiles>;
	space_list_markdown_files: CommandDef<
		{ dir?: string | null; recursive?: boolean | null; limit?: number | null },
		FsEntry[]
	>;
	space_list_files: CommandDef<
		{ dir?: string | null; recursive?: boolean | null; limit?: number | null },
		FsEntry[]
	>;
	space_dir_recent_entries: CommandDef<
		{ dir?: string | null; limit?: number | null },
		RecentEntry[]
	>;
	space_dir_children_summary: CommandDef<
		{ dir?: string | null; preview_limit?: number | null },
		DirChildSummary[]
	>;
	space_read_text: CommandDef<{ path: string }, TextFileDoc>;
	space_read_texts_batch: CommandDef<{ paths: string[] }, TextFileDocBatch[]>;
	space_read_text_preview: CommandDef<
		{ path: string; max_bytes?: number | null },
		TextFilePreviewDoc
	>;
	space_read_binary_preview: CommandDef<
		{ path: string; max_bytes?: number | null },
		BinaryFilePreviewDoc
	>;
	space_save_pasted_image: CommandDef<
		{
			source_path: string;
			target_dir: string;
			data_url: string;
			alt?: string | null;
		},
		SavedPastedImage
	>;
	space_write_text: CommandDef<
		{ path: string; text: string; base_mtime_ms?: number | null },
		TextFileWriteResult
	>;
	space_open_or_create_text: CommandDef<
		{ path: string; text: string },
		OpenOrCreateTextResult
	>;
	space_create_dir: CommandDef<{ path: string }, void>;
	space_duplicate_path: CommandDef<{ path: string }, FsEntry>;
	space_rename_path: CommandDef<{ from_path: string; to_path: string }, void>;
	space_delete_path: CommandDef<
		{ path: string; recursive?: boolean | null },
		void
	>;
	space_resolve_abs_path: CommandDef<{ path: string }, string>;
	space_relativize_path: CommandDef<{ abs_path: string }, string>;
	space_resolve_wikilink: CommandDef<{ target: string }, string | null>;
	space_resolve_markdown_link: CommandDef<
		{ href: string; sourcePath: string },
		string | null
	>;
	space_suggest_links: CommandDef<
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
	notes_list: CommandDef<void, NoteMeta[]>;
	note_create: CommandDef<{ title: string }, NoteMeta>;
	note_read: CommandDef<{ id: string }, NoteDoc>;
	note_write: CommandDef<
		{ id: string; markdown: string; base_etag?: string | null },
		NoteWriteResult
	>;
	note_delete: CommandDef<{ id: string }, void>;
	note_frontmatter_parse_properties: CommandDef<
		{ frontmatter?: string | null },
		NoteProperty[]
	>;
	note_frontmatter_render_properties: CommandDef<
		{ properties: NoteProperty[] },
		string | null
	>;
	note_attach_file: CommandDef<
		{ note_id: string; source_path: string },
		AttachmentResult
	>;
	databases_list: CommandDef<void, WorkspaceDatabaseSummary[]>;
	databases_get: CommandDef<{ database_id: string }, WorkspaceDatabaseDocument>;
	databases_create: CommandDef<{ name: string }, WorkspaceDatabaseDocument>;
	databases_update: CommandDef<
		{ database: WorkspaceDatabaseDefinition },
		WorkspaceDatabaseDocument
	>;
	databases_delete: CommandDef<{ database_id: string }, void>;
	databases_duplicate: CommandDef<
		{ database_id: string },
		WorkspaceDatabaseDocument
	>;
	databases_query_rows: CommandDef<
		{
			database_id: string;
			view_id: string;
			offset?: number | null;
			limit?: number | null;
		},
		WorkspaceDatabaseQueryResult
	>;
	databases_update_cell: CommandDef<
		{
			note_path: string;
			column: DatabaseColumn;
			value: DatabaseCellValue;
		},
		DatabaseRow
	>;
	databases_create_row: CommandDef<
		{ database_id: string; title?: string | null },
		DatabaseCreateRowResult
	>;
	databases_preview_context: CommandDef<
		{ note_path: string },
		WorkspaceDatabasePreviewContext
	>;
	index_rebuild: CommandDef<void, IndexRebuildResult>;
	search: CommandDef<{ query: string }, SearchResult[]>;
	search_advanced: CommandDef<
		{ request: SearchAdvancedRequest },
		SearchResult[]
	>;
	search_parse_and_run: CommandDef<
		{ raw_query: string; limit?: number | null },
		SearchResult[]
	>;
	index_set_people_mentions_as_tags_enabled: CommandDef<
		{ enabled: boolean },
		void
	>;
	search_with_tags: CommandDef<
		{ tags: string[]; query?: string | null; limit?: number | null },
		SearchResult[]
	>;
	all_docs_list: CommandDef<
		{ limit?: number | null; folder_prefix?: string | null },
		AllDocsItem[]
	>;
	recent_notes: CommandDef<{ limit?: number | null }, SearchResult[]>;
	calendar_query_range: CommandDef<
		{
			start_date: string;
			end_date: string;
			selected_date: string;
			daily_notes_folder?: string | null;
		},
		CalendarRangeResponse
	>;
	tags_list: CommandDef<{ limit?: number | null }, TagCount[]>;
	people_list: CommandDef<{ limit?: number | null }, PersonCount[]>;
	tag_notes: CommandDef<{ tag: string; limit?: number | null }, SearchResult[]>;
	tasks_query: CommandDef<
		{
			bucket: TaskBucket;
			today: string;
			limit?: number | null;
			folders?: string[] | null;
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
	task_summary: CommandDef<{ markdown: string }, NoteTaskSummary>;
	task_summaries_for_paths: CommandDef<
		{ note_paths: string[] },
		NoteTaskSummaryItem[]
	>;
	backlinks: CommandDef<{ note_id: string }, BacklinkItem[]>;
	note_local_graph: CommandDef<{ note_id: string }, LocalNoteGraph>;
	link_preview: CommandDef<{ url: string; force?: boolean }, LinkPreview>;
	web_clip_save: CommandDef<
		{ url: string; folder?: string },
		{ rel_path: string; title: string }
	>;
	git_sync_status_read: CommandDef<void, GitSyncStatus>;
	git_sync_config_read: CommandDef<void, GitSyncConfig | null>;
	git_sync_config_update: CommandDef<
		{ patch: GitSyncConfigPatch },
		GitSyncConfig
	>;
	git_sync_run: CommandDef<{ request: GitSyncRunRequest }, GitSyncStatus>;
	git_sync_disconnect: CommandDef<void, GitSyncStatus>;

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
	ai_models_list: CommandDef<
		{ profile_id: string; provider?: AiProviderKind | null },
		AiModel[]
	>;
	ai_chat_history_list: CommandDef<
		{ limit?: number | null },
		AiChatHistorySummary[]
	>;
	ai_chat_history_get: CommandDef<{ job_id: string }, AiChatHistoryDetail>;
	codex_account_read: CommandDef<
		void,
		{
			status: string;
			email?: string | null;
			display_name?: string | null;
			auth_mode?: string | null;
		}
	>;
	codex_login_start: CommandDef<
		void,
		{
			auth_url: string;
			flow_id: string;
		}
	>;
	codex_login_complete: CommandDef<
		{ flow_id: string },
		{
			connected: boolean;
		}
	>;
	codex_logout: CommandDef<void, void>;
	codex_rate_limits_read: CommandDef<void, CodexRateLimits>;
	codex_chat_start: CommandDef<
		{
			request: {
				profile_id: string;
				thread_id?: string | null;
				messages: AiMessage[];
				context?: string | null;
				mode?: AiAssistantMode | null;
			};
		},
		{ job_id: string }
	>;
	codex_chat_cancel: CommandDef<{ job_id: string }, void>;
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
