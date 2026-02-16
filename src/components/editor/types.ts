import type { Editor } from "@tiptap/core";

export type CanvasInlineEditorMode = "plain" | "rich" | "preview";

export interface CanvasNoteInlineEditorProps {
	markdown: string;
	relPath?: string;
	mode: CanvasInlineEditorMode;
	onModeChange: (mode: CanvasInlineEditorMode) => void;
	onChange: (nextMarkdown: string) => void;
	onRegisterCalloutInserter?:
		| ((inserter: ((type: string) => void) | null) => void)
		| undefined;
}

export interface SlashCommandItem {
	title: string;
	description: string;
	keywords: string[];
	command: (ctx: {
		editor: Editor;
		range: { from: number; to: number };
	}) => void;
}
