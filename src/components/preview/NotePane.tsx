import type { TextFileDoc } from "../../lib/tauri";
import { MarkdownEditorPane } from "./MarkdownEditorPane";

interface NotePaneProps {
	relPath: string;
	onDirtyChange?: (dirty: boolean) => void;
	initialDoc?: TextFileDoc | null;
}

export function NotePane({
	relPath,
	onDirtyChange,
	initialDoc = null,
}: NotePaneProps) {
	return (
		<MarkdownEditorPane
			relPath={relPath}
			initialDoc={initialDoc}
			onDirtyChange={onDirtyChange}
		/>
	);
}
