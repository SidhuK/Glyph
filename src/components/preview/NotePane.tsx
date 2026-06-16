import type { GitCommitDiff, TextFileDoc } from "../../lib/tauri";
import type { ExtractToNoteActions } from "../editor/types";
import { MarkdownEditorPane } from "./MarkdownEditorPane";

interface NotePaneProps {
	relPath: string;
	onDirtyChange?: (dirty: boolean) => void;
	onInfoSidebarOpenChange?: (open: boolean) => void;
	gitDiff?: GitCommitDiff | null;
	onGitDiffChange?: (diff: GitCommitDiff | null) => void;
	initialDoc?: TextFileDoc | null;
	extractToNoteActions?: ExtractToNoteActions;
}

export function NotePane({
	relPath,
	onDirtyChange,
	onInfoSidebarOpenChange,
	gitDiff = null,
	onGitDiffChange,
	initialDoc = null,
	extractToNoteActions,
}: NotePaneProps) {
	return (
		<MarkdownEditorPane
			relPath={relPath}
			initialDoc={initialDoc}
			onDirtyChange={onDirtyChange}
			onInfoSidebarOpenChange={onInfoSidebarOpenChange}
			gitDiff={gitDiff}
			onGitDiffChange={onGitDiffChange}
			extractToNoteActions={extractToNoteActions}
		/>
	);
}
