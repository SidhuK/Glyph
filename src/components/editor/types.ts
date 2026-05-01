import type { Editor } from "@tiptap/core";

export type NoteInlineEditorMode = "plain" | "rich" | "preview";
export type PasteMarkdownBehavior = "plain-text" | "smart-markdown";

export interface CreateMarkdownFileOptions {
	openParentDir?: string | null;
	path: string;
	text: string;
}

export interface ExtractToNoteActions {
	createMarkdownFile: (
		options: CreateMarkdownFileOptions,
	) => Promise<string | null>;
	openNote: (path: string) => Promise<void> | void;
	openNoteInNewTab: (path: string) => Promise<void> | void;
}

export interface NoteInlineEditorProps {
	markdown: string;
	relPath?: string;
	mode: NoteInlineEditorMode;
	zenModeActive?: boolean;
	onChange: (nextMarkdown: string) => void;
	onFrontmatterCommit?: () => void;
	extractToNoteActions?: ExtractToNoteActions;
	interactive?: boolean;
	showBacklinks?: boolean;
	deferHeavyFeatures?: boolean;
	pasteMarkdownBehavior?: PasteMarkdownBehavior;
	onRegisterCalloutInserter?:
		| ((inserter: ((type: string) => void) | null) => void)
		| undefined;
	onEditorReady?: ((editor: Editor | null) => void) | undefined;
}

export interface SlashCommandItem {
	icon: string;
	title: string;
	description: string;
	keywords: string[];
	command: (ctx: {
		editor: Editor;
		range: { from: number; to: number };
	}) => void;
}
