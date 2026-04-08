import type { Editor } from "@tiptap/core";

export type CanvasInlineEditorMode = "plain" | "rich" | "preview";
export type PasteMarkdownBehavior = "plain-text" | "smart-markdown";

export interface CanvasNoteInlineEditorProps {
	markdown: string;
	relPath?: string;
	mode: CanvasInlineEditorMode;
	zenModeActive?: boolean;
	onChange: (nextMarkdown: string) => void;
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
