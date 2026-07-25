import type { AnyExtension, Editor } from "@tiptap/core";
import type { EditorViewMode } from "../../lib/editorMode";
import type { RawMarkdownEditorHandle } from "./raw/types";

export type NoteInlineEditorMode = EditorViewMode;
export type NoteInlineEditorChrome = "full" | "minimal";
export type PasteMarkdownBehavior = "plain-text" | "smart-markdown";
export type RolloverMoveTarget = "today" | "tomorrow";

/** Position of a task within the editor's unfinished-task list. */
export interface RolloverTaskPosition {
	index: number;
	total: number;
}

export interface RolloverTaskActions {
	targets: RolloverMoveTarget[];
	onMoveCandidate: (
		position: RolloverTaskPosition,
		target: RolloverMoveTarget,
	) => void;
}

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
	onChange: (nextMarkdown: string) => void;
	onFrontmatterCommit?: () => void;
	extractToNoteActions?: ExtractToNoteActions;
	rolloverTaskActions?: RolloverTaskActions | null;
	interactive?: boolean;
	deferHeavyFeatures?: boolean;
	chrome?: NoteInlineEditorChrome;
	additionalExtensions?: AnyExtension[];
	placeholder?: string;
	pasteMarkdownBehavior?: PasteMarkdownBehavior;
	enableFocusMode?: boolean;
	onRegisterCalloutInserter?:
		| ((inserter: ((type: string) => void) | null) => void)
		| undefined;
	onEditorReady?:
		| ((editor: Editor | null, contentRoot: HTMLElement | null) => void)
		| undefined;
	onRawEditorReady?:
		| ((editor: RawMarkdownEditorHandle | null) => void)
		| undefined;
	/**
	 * Registers a callback that synchronously flushes the rich editor's
	 * debounced Markdown sync into `onChange`. Callers use it to make
	 * autosave snapshots and reload guards see the newest typed text.
	 */
	onFlushPendingEditsReady?: ((flush: (() => void) | null) => void) | undefined;
}
