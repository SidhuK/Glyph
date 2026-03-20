import { MarkdownEditorPane } from "./MarkdownEditorPane";

interface NotePaneProps {
	relPath: string;
	onOpenFile: (relPath: string) => Promise<void>;
	onDirtyChange?: (dirty: boolean) => void;
}

export function NotePane({ relPath, onDirtyChange }: NotePaneProps) {
	return <MarkdownEditorPane relPath={relPath} onDirtyChange={onDirtyChange} />;
}
