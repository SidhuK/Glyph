export interface RawMarkdownEditorHandle {
	focus: () => void;
	getSelectedText: () => string;
	selectRange: (from: number, to: number) => void;
}
