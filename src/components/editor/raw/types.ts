export interface RawMarkdownEditorHandle {
	flushPendingChange: () => void;
	focus: () => void;
	getMarkdown: () => string;
	getSelectedText: () => string;
	selectRange: (from: number, to: number) => void;
}
