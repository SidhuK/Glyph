import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type { AttachmentStorageMode } from "./settings";

export interface AppInfo {
	name: string;
	version: string;
	identifier: string;
}

export interface ReleaseChannelUpdate {
	rid: number;
	currentVersion: string;
	version: string;
	date?: string;
	body?: string;
	rawJson: Record<string, unknown>;
}

interface SpaceInfo {
	root: string;
	schema_version: number;
	onboarding_note_path?: string | null;
}

export interface FsEntry {
	name: string;
	rel_path: string;
	kind: "dir" | "file";
	is_markdown: boolean;
	created?: string | null;
	updated?: string | null;
}

export interface FsEntryList {
	files: FsEntry[];
	truncated: boolean;
}

export interface LinkRewriteResult {
	changed_files: string[];
	changed_links: number;
}

export interface FileTreeAppearance {
	color?: string | null;
	icon?: string | null;
}

export interface TagAppearance {
	icon?: string | null;
}

type PinnedFiles = string[];

export interface TextFileDoc {
	rel_path: string;
	text: string;
	etag: string;
	mtime_ms: number;
}

interface TextFileWriteResult {
	etag: string;
	mtime_ms: number;
}

interface ExternalMarkdownDoc {
	path: string;
	text: string;
	etag: string;
	mtime_ms: number;
}

interface ExternalMarkdownWriteResult {
	etag: string;
	mtime_ms: number;
}

interface OpenOrCreateTextResult {
	created: boolean;
	mtime_ms: number;
}

interface TextFileDocBatch {
	rel_path: string;
	text: string | null;
	etag: string | null;
	mtime_ms: number;
	error: string | null;
}

interface TextFilePreviewDoc {
	rel_path: string;
	text: string;
	mtime_ms: number;
	truncated: boolean;
	bytes_read: number;
	total_bytes: number;
}

interface BinaryFilePreviewDoc {
	rel_path: string;
	mime: string;
	data_url: string;
	truncated: boolean;
	bytes_read: number;
	total_bytes: number;
	mtime_ms: number;
}

interface SavedPastedImage {
	asset_rel_path: string;
	href: string;
	markdown: string;
}

export interface NoteProperty {
	key: string;
	kind: string;
	value_text: string | null;
	value_bool: boolean | null;
	value_list: string[];
}

interface DatabaseSource {
	kind: "all_notes" | "folder" | "tag" | "search";
	value: string;
	recursive: boolean;
}

interface DatabaseNewNoteConfig {
	folder: string;
}

interface WorkspaceDatabaseGrouping {
	column_id: string;
	ascending: boolean;
}

interface DatabaseViewState {
	layout: "table" | "board";
	search?: string;
	board_group_by?: string | null;
	board_grouping?: WorkspaceDatabaseGrouping | null;
	board_lane_colors?: Record<string, string>;
	board_lane_order?: Record<string, string[]>;
	board_card_order?: Record<string, Record<string, string[]>>;
	board_card_fields?: string[];
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
		| "greater_than"
		| "less_than"
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

export interface DatabaseCreateRowInitialValue {
	column: DatabaseColumn;
	value: DatabaseCellValue;
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

interface WorkspaceDatabaseView {
	id: string;
	name: string;
	layout: "table" | "board";
	search?: string;
	icon?: string | null;
	color?: string | null;
	columns: DatabaseColumn[];
	sorts: DatabaseSort[];
	filters: DatabaseFilter[];
	grouping?: WorkspaceDatabaseGrouping | null;
	board_lane_colors?: Record<string, string>;
	board_lane_order?: Record<string, string[]>;
	board_card_order?: Record<string, Record<string, string[]>>;
	board_card_fields?: string[];
	created_at: string;
	updated_at: string;
}

interface WorkspaceDatabaseSchemaField {
	id: string;
	label: string;
	kind: string;
	property_key?: string | null;
	default_value?: DatabaseCellValue | null;
	relation_database_id?: string | null;
}

export interface WorkspaceDatabaseDefinition {
	id: string;
	name: string;
	icon?: string | null;
	color?: string | null;
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

interface DatabaseCreateRowResult {
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
	people?: string[];
}

export interface CalendarDayActivity {
	date: string;
	hasDailyNote: boolean;
	hasCreated: boolean;
	hasEdited: boolean;
}

export interface CalendarDateNote {
	path: string;
	title: string;
	kinds: Array<"daily" | "created" | "edited">;
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

export interface NoteRelationship {
	from_id: string;
	field_key: string;
	to_id: string | null;
	to_title: string | null;
	target_title: string;
	ordinal: number;
}

interface LocalConnectionsNode {
	id: string;
	title: string;
	is_center: boolean;
}

interface LocalConnectionsEdge {
	source: string;
	target: string;
}

interface LocalConnectionsTagNode {
	id: string;
	tag: string;
	title: string;
	note_count: number;
}

interface LocalConnectionsTagEdge {
	tag_id: string;
	note_id: string;
}

export interface LocalNoteConnections {
	center: LocalConnectionsNode;
	nodes: LocalConnectionsNode[];
	edges: LocalConnectionsEdge[];
	tags: LocalConnectionsTagNode[];
	tag_edges: LocalConnectionsTagEdge[];
}

export interface SpaceConnectionsNode {
	id: string;
	title: string;
	link_count: number;
	tag_count: number;
	is_isolated: boolean;
}

export interface SpaceConnectionsEdge {
	from_id: string;
	to_id: string;
	kind: "link" | "relationship";
}

export interface SpaceConnectionsTagNode {
	id: string;
	tag: string;
	title: string;
	note_count: number;
}

export interface SpaceConnectionsTagEdge {
	tag_id: string;
	note_id: string;
}

export interface SpaceConnections {
	nodes: SpaceConnectionsNode[];
	edges: SpaceConnectionsEdge[];
	tags: SpaceConnectionsTagNode[];
	tag_edges: SpaceConnectionsTagEdge[];
	truncated: boolean;
	truncated_tags: boolean;
	total_notes: number;
	total_tags: number;
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

export interface NoteTaskSummary {
	total_count: number;
	completed_count: number;
	open_count: number;
}

interface NoteTaskSummaryItem extends NoteTaskSummary {
	note_path: string;
}

export interface DirChildSummary {
	dir_rel_path: string;
	name: string;
	total_files_recursive: number;
	total_markdown_recursive: number;
	truncated: boolean;
}

interface IndexRebuildResult {
	indexed: number;
}

interface AiContextAttachment {
	kind: "folder" | "file";
	path: string;
	label?: string | null;
}

interface AiContextIndexItem {
	path: string;
	label: string;
}

interface AiContextIndexResponse {
	folders: AiContextIndexItem[];
	files: AiContextIndexItem[];
}

interface AiContextManifestItem {
	kind: string;
	label: string;
	chars: number;
	est_tokens: number;
	truncated: boolean;
}

interface AiContextManifestResponse {
	items: AiContextManifestItem[];
	total_chars: number;
	est_tokens: number;
}

interface AiContextBuildResponse {
	payload: string;
	manifest: AiContextManifestResponse;
	resolved_paths: string[];
}

type GitSyncRepoMode = "managed_new_repo" | "adopted_existing_repo";
export type GitSyncConflictPolicy = "local_wins" | "remote_wins";
type GitSyncPhase =
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

export interface GitHistoryCommit {
	hash: string;
	short_hash: string;
	rel_path: string;
	author_name: string;
	author_email: string;
	timestamp_ms: number;
	subject: string;
	added_count: number;
	modified_count: number;
	deleted_count: number;
}

export interface GitCommitDiff {
	commit: GitHistoryCommit;
	diff: string;
}

interface GitSyncContext {
	templates_folder?: string | null;
	attachment_storage_mode?: AttachmentStorageMode | null;
	attachment_folder?: string | null;
}

interface GitSyncRunRequest {
	mode: GitSyncRunMode;
	context: GitSyncContext;
}

interface GitSyncConfigPatch {
	enabled?: boolean;
	conflict_policy?: GitSyncConflictPolicy;
	interval_minutes?: number;
	inclusions?: GitSyncInclusionSettings;
	paused?: boolean;
}

type LicenseMode =
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
	| "llama_cpp"
	| "codex_chatgpt"
	| "amp"
	| "claude_code"
	| "opencode"
	| "pi";

export type AiAssistantMode = "chat" | "create";

interface AiHeader {
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

interface AiChatStartResult {
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

interface AiReasoningEffortOption {
	effort: string;
	description?: string | null;
}

export interface ProviderSupportEntry {
	display_name: string;
	url: string | null;
	endpoints: Record<string, boolean>;
}

interface ProviderSupportDocument {
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

interface CodexRateLimitWindow {
	used_percent: number;
	window_duration_mins?: number | null;
	resets_at?: number | null;
}

interface CodexRateLimitBucket {
	limit_id?: string | null;
	limit_name?: string | null;
	primary?: CodexRateLimitWindow | null;
	secondary?: CodexRateLimitWindow | null;
}

interface CodexRateLimits {
	buckets: CodexRateLimitBucket[];
}

type CommandDef<Args, Result> = { args: Args; result: Result };

interface TauriCommands {
	app_info: CommandDef<void, AppInfo>;
	updater_check_release_channel: CommandDef<
		{ channel: "stable" | "alpha" },
		ReleaseChannelUpdate | null
	>;
	system_fonts_list: CommandDef<void, string[]>;
	system_monospace_fonts_list: CommandDef<void, string[]>;
	set_markdown_menu_visible: CommandDef<{ visible: boolean }, void>;
	show_quick_note_window: CommandDef<void, void>;
	hide_quick_note_window: CommandDef<void, void>;
	show_main_window: CommandDef<void, void>;
	set_quick_note_global_shortcut: CommandDef<
		{ accelerator?: string | null },
		void
	>;
	set_recent_spaces_menu: CommandDef<{ recent_spaces: string[] }, void>;
	set_menu_shortcuts: CommandDef<
		{
			accelerators: Record<string, string | null>;
		},
		void
	>;
	set_window_vibrancy_theme: CommandDef<{ theme: string }, void>;
	external_markdown_window_path: CommandDef<void, string>;
	external_markdown_read: CommandDef<{ path: string }, ExternalMarkdownDoc>;
	external_markdown_write: CommandDef<
		{ path: string; text: string; base_mtime_ms?: number | null },
		ExternalMarkdownWriteResult
	>;
	external_markdown_finish_close: CommandDef<void, void>;
	license_bootstrap_status: CommandDef<void, LicenseStatus>;
	license_activate: CommandDef<{ license_key: string }, LicenseActivateResult>;
	license_clear_local: CommandDef<void, LicenseActivateResult>;
	space_create: CommandDef<{ path: string }, SpaceInfo>;
	space_open: CommandDef<{ path: string }, SpaceInfo>;
	space_open_window: CommandDef<
		{ path: string; create?: boolean | null },
		SpaceInfo
	>;
	space_get_current: CommandDef<void, string | null>;
	space_get_current_info: CommandDef<void, SpaceInfo | null>;
	space_show_onboarding_note: CommandDef<void, string>;
	space_close: CommandDef<void, void>;
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
	tag_appearance_list: CommandDef<void, Record<string, TagAppearance>>;
	tag_appearance_set: CommandDef<
		{ tag: string; icon?: string | null },
		TagAppearance | null
	>;
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
	space_list_non_markdown_files: CommandDef<
		{ dir?: string | null; limit?: number | null },
		FsEntryList
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
	space_rename_path: CommandDef<
		{ from_path: string; to_path: string },
		LinkRewriteResult
	>;
	space_delete_path: CommandDef<
		{ path: string; recursive?: boolean | null },
		void
	>;
	space_resolve_abs_path: CommandDef<{ path: string }, string>;
	space_reveal_path: CommandDef<{ path: string }, void>;
	space_relativize_path: CommandDef<{ abs_path: string }, string>;
	space_resolve_wikilink: CommandDef<{ target: string }, string | null>;
	space_resolve_image_wikilink: CommandDef<{ target: string }, string | null>;
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
				include_pdf?: boolean | null;
				include_images?: boolean | null;
				strip_markdown_ext?: boolean | null;
				relative_to_source?: boolean | null;
				limit?: number | null;
			};
		},
		{ path: string; title: string; insert_text: string }[]
	>;
	note_frontmatter_parse_properties: CommandDef<
		{ frontmatter?: string | null },
		NoteProperty[]
	>;
	note_frontmatter_render_properties: CommandDef<
		{ properties: NoteProperty[] },
		string | null
	>;
	databases_list: CommandDef<void, WorkspaceDatabaseSummary[]>;
	databases_get: CommandDef<{ database_id: string }, WorkspaceDatabaseDocument>;
	databases_create: CommandDef<
		{ name: string; folder: string },
		WorkspaceDatabaseDocument
	>;
	databases_update: CommandDef<
		{ database: WorkspaceDatabaseDefinition },
		WorkspaceDatabaseDocument
	>;
	databases_delete: CommandDef<{ database_id: string }, void>;
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
		{
			database_id: string;
			title?: string | null;
			initial_values?: DatabaseCreateRowInitialValue[] | null;
		},
		DatabaseCreateRowResult
	>;
	databases_preview_context: CommandDef<
		{ note_path: string; space_path?: string | null },
		WorkspaceDatabasePreviewContext
	>;
	databases_status_colors_get: CommandDef<void, Record<string, string>>;
	databases_status_color_set: CommandDef<
		{ status: string; color?: string | null },
		Record<string, string>
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
	all_docs_list: CommandDef<
		{ limit?: number | null; folder_prefix?: string | null },
		AllDocsItem[]
	>;
	all_docs_count: CommandDef<{ folder_prefix?: string | null }, number>;
	index_calendar_activity: CommandDef<
		{
			from_date: string;
			to_date: string;
			daily_note_folder?: string | null;
		},
		CalendarDayActivity[]
	>;
	index_calendar_notes_for_date: CommandDef<
		{
			date: string;
			daily_note_folder?: string | null;
		},
		CalendarDateNote[]
	>;
	tags_list: CommandDef<
		{ limit?: number | null; offset?: number | null },
		TagCount[]
	>;
	people_list: CommandDef<
		{ limit?: number | null; offset?: number | null },
		PersonCount[]
	>;
	task_summary: CommandDef<{ markdown: string }, NoteTaskSummary>;
	task_summaries_for_paths: CommandDef<
		{ note_paths: string[] },
		NoteTaskSummaryItem[]
	>;
	backlinks: CommandDef<
		{ note_id: string; space_path?: string | null },
		BacklinkItem[]
	>;
	note_relationships: CommandDef<{ note_id: string }, NoteRelationship[]>;
	note_local_connections: CommandDef<{ note_id: string }, LocalNoteConnections>;
	space_connections: CommandDef<
		{ max_nodes?: number; max_tags?: number },
		SpaceConnections
	>;
	git_sync_status_read: CommandDef<void, GitSyncStatus>;
	git_sync_config_read: CommandDef<void, GitSyncConfig | null>;
	git_sync_config_update: CommandDef<
		{ patch: GitSyncConfigPatch },
		GitSyncConfig
	>;
	git_sync_run: CommandDef<{ request: GitSyncRunRequest }, GitSyncStatus>;
	git_sync_disconnect: CommandDef<void, GitSyncStatus>;
	git_history_list: CommandDef<
		{ path: string; limit?: number | null },
		GitHistoryCommit[]
	>;
	git_history_diff: CommandDef<
		{ path: string; commit: GitHistoryCommit },
		GitCommitDiff
	>;

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
