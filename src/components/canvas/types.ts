import type { CanvasInlineEditorMode } from "../editor";

export type {
	CanvasNode,
	CanvasEdge,
	CanvasNodeData,
	NoteNodeData,
	TextNodeData,
	FileNodeData,
	LinkNodeData,
	FrameNodeData,
	FolderNodeData,
	FolderPreviewNodeData,
	NoteCanvasNode,
	TextCanvasNode,
	FileCanvasNode,
	LinkCanvasNode,
	FrameCanvasNode,
	FolderCanvasNode,
	FolderPreviewCanvasNode,
} from "../../lib/canvasFlowTypes";
export {
	isNoteNode,
	isTextNode,
	isFileNode,
	isLinkNode,
	isFrameNode,
	isFolderNode,
	isFolderPreviewNode,
} from "../../lib/canvasFlowTypes";
import type { CanvasEdge, CanvasNode } from "../../lib/canvasFlowTypes";

export interface CanvasDocLike {
	version: number;
	id: string;
	title: string;
	nodes: CanvasNode[];
	edges: CanvasEdge[];
}

export interface CanvasPaneProps {
	doc: CanvasDocLike | null;
	onSave: (doc: CanvasDocLike) => Promise<void>;
	onOpenNote: (noteId: string) => void;
	onOpenFolder: (dir: string) => void;
	onNewFileInDir: (dir: string) => Promise<void>;
	onNewFolderInDir: (dir: string) => Promise<string | null>;
	onRenamePath: (
		path: string,
		nextName: string,
		kind?: "dir" | "file",
	) => Promise<string | null>;
	vaultPath: string | null;
	onSelectionChange?: (selected: CanvasNode[]) => void;
	externalCommand?: CanvasExternalCommand | null;
	onExternalCommandHandled?: (id: string) => void;
}

export type CanvasExternalCommand =
	| {
			id: string;
			kind: "add_note_node";
			noteId: string;
			title: string;
			content?: string;
	  }
	| { id: string; kind: "focus_node"; nodeId: string }
	| { id: string; kind: "open_note_editor"; noteId: string; title?: string }
	| {
			id: string;
			kind: "apply_note_markdown";
			noteId: string;
			markdown: string;
	  }
	| { id: string; kind: "add_text_node"; text: string }
	| { id: string; kind: "add_link_node"; url: string }
	| {
			id: string;
			kind: "add_nodes_batch";
			nodes: Array<
				| { kind: "file"; path: string; title: string }
				| { kind: "note"; noteId: string; title: string; content?: string }
				| { kind: "text"; text: string }
				| { kind: "link"; url: string }
			>;
	  };

export type NoteEditPhase =
	| "loading"
	| "ready"
	| "saving"
	| "error"
	| "conflict";

export type CanvasNoteEditSession = {
	nodeId: string;
	noteId: string;
	phase: NoteEditPhase;
	markdown: string;
	baseMtimeMs: number | null;
	dirty: boolean;
	lastSavedMarkdown: string;
	mode: CanvasInlineEditorMode;
	errorMessage: string;
};

export type CanvasNoteEditActions = {
	session: CanvasNoteEditSession | null;
	openEditor: (nodeId: string) => void;
	closeEditor: () => void;
	saveNow: () => void;
	reloadFromDisk: () => void;
	overwriteDisk: () => void;
	setEditorMode: (mode: CanvasInlineEditorMode) => void;
	updateMarkdown: (nextMarkdown: string) => void;
};

export type CanvasActions = {
	openNote: (relPath: string) => void;
	openFolder: (dir: string) => void;
	newFileInDir: (dir: string) => Promise<void>;
	newFolderInDir: (dir: string) => Promise<string | null>;
	reflowGrid: () => void;
	renamePath: (
		path: string,
		nextName: string,
		kind?: "dir" | "file",
	) => Promise<string | null>;
	toggleFolderFan: (folderNodeId: string) => void;
	holdFolderPreview: (folderNodeId: string) => void;
	releaseFolderPreview: (folderNodeId: string) => void;
};

export type NoteTab = {
	tabId: string;
	noteId: string | null;
	title: string;
};
