import type { AiMessage, CanvasNodeData, NoteMeta } from "../../lib/tauri";
import type { CanvasDocLike } from "../CanvasPane";

export type ChatMessage = AiMessage & { id: string };

export type ContextSpec = {
	neighborDepth: 0 | 1 | 2;
	includeNoteContents: boolean;
	includeLinkPreviewText: boolean;
	includeActiveNote: boolean;
	includeSelectedNodes: boolean;
	charBudget: number;
};

export type ContextManifestItem = {
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

export interface SelectedCanvasNode {
	id: string;
	type: string | null;
	data: CanvasNodeData | null;
}

export interface AIPaneProps {
	activeNoteId: string | null;
	activeNoteTitle: string | null;
	activeNoteMarkdown?: string | null;
	selectedCanvasNodes: SelectedCanvasNode[];
	canvasDoc: CanvasDocLike | null;
	onApplyToActiveNote: (markdown: string) => Promise<void>;
	onCreateNoteFromMarkdown: (
		title: string,
		markdown: string,
	) => Promise<NoteMeta | null>;
	onAddCanvasNoteNode: (noteId: string, title: string) => void;
	onAddCanvasTextNode: (text: string) => void;
}

export interface StagedRewrite {
	jobId: string;
	proposedMarkdown: string;
}

export interface ActiveNoteDisk {
	id: string;
	title: string;
	markdown: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Calling Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tool event payload from backend
 * Matches Rust AiToolEvent structure
 */
export interface AiToolEventPayload {
	job_id: string;
	tool:
		| "list_dir"
		| "search"
		| "stat"
		| "read_file"
		| "read_files_batch"
		| "write_file"
		| "apply_patch"
		| "move"
		| "mkdir"
		| "delete";
	phase: "call" | "result" | "error";
	at_ms?: number;
	call_id?: string;
	payload?: unknown;
	error?: string;
}

/**
 * Tool execution phase for UI state
 */
export type ToolPhase = "call" | "result" | "error";

/**
 * UI representation of a tool execution
 * Tracks the lifecycle of a single tool call
 */
export interface ToolExecution {
	/** Unique ID for React keys - uses call_id or generated fallback */
	id: string;
	/** Tool name: search_vault, list_files, read_file */
	tool: string;
	/** Current phase in UI state machine */
	phase: ToolPhase;
	/** Arguments passed to the tool or result payload */
	payload?: unknown;
	/** Error message on failure */
	error?: string;
	/** Timestamp when tool was called */
	timestamp: number;
}
