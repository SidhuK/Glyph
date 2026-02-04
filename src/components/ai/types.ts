import type { AiMessage, NoteMeta } from "../../lib/tauri";
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
	data: Record<string, unknown> | null;
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
