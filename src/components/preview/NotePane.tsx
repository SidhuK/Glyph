import type { TextFileDoc } from "../../lib/tauri";
import type { ExtractToNoteActions } from "../editor/types";
import { MarkdownEditorPane } from "./MarkdownEditorPane";

interface NotePaneProps {
	relPath: string;
	onDirtyChange?: (dirty: boolean) => void;
	initialDoc?: TextFileDoc | null;
	extractToNoteActions?: ExtractToNoteActions;
}

export function NotePane({
	relPath,
	onDirtyChange,
	initialDoc = null,
	extractToNoteActions,
}: NotePaneProps) {
	return (
		<MarkdownEditorPane
			relPath={relPath}
			initialDoc={initialDoc}
			onDirtyChange={onDirtyChange}
			extractToNoteActions={extractToNoteActions}
		/>
	);
}
