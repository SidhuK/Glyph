import type { Edge, Node } from "@xyflow/react";
import type { LinkPreview } from "./tauri";

export interface NoteNodeData {
	noteId: string;
	title: string;
	content?: string;
	[key: string]: unknown;
}

export interface TextNodeData {
	text: string;
	[key: string]: unknown;
}

export interface FileNodeData {
	path: string;
	title: string;
	[key: string]: unknown;
}

export interface LinkNodeData {
	url: string;
	title?: string;
	preview?: LinkPreview;
	status?: string;
	image_src?: string;
	[key: string]: unknown;
}

export interface FrameNodeData {
	title?: string;
	width?: number;
	height?: number;
	[key: string]: unknown;
}

export interface FolderNodeData {
	dir: string;
	title: string;
	[key: string]: unknown;
}

export type CanvasNodeData = Record<string, unknown>;

type CanvasNodeLegacyProps = {
	parentNode?: string | null;
};

export type CanvasNode = Node<CanvasNodeData> & CanvasNodeLegacyProps;

export type NoteCanvasNode = Node<NoteNodeData, "note"> & CanvasNodeLegacyProps;
export type TextCanvasNode = Node<TextNodeData, "text"> & CanvasNodeLegacyProps;
export type FileCanvasNode = Node<FileNodeData, "file"> & CanvasNodeLegacyProps;
export type LinkCanvasNode = Node<LinkNodeData, "link"> & CanvasNodeLegacyProps;
export type FrameCanvasNode = Node<FrameNodeData, "frame"> &
	CanvasNodeLegacyProps;
export type FolderCanvasNode = Node<FolderNodeData, "folder"> &
	CanvasNodeLegacyProps;

export type CanvasEdge = Edge<Record<string, unknown>> & {
	label?: string;
};

export function isNoteNode(n: CanvasNode): n is NoteCanvasNode {
	return n.type === "note";
}

export function isTextNode(n: CanvasNode): n is TextCanvasNode {
	return n.type === "text";
}

export function isFileNode(n: CanvasNode): n is FileCanvasNode {
	return n.type === "file";
}

export function isLinkNode(n: CanvasNode): n is LinkCanvasNode {
	return n.type === "link";
}

export function isFrameNode(n: CanvasNode): n is FrameCanvasNode {
	return n.type === "frame";
}

export function isFolderNode(n: CanvasNode): n is FolderCanvasNode {
	return n.type === "folder";
}
