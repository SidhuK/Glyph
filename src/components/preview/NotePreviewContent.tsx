import { NoteInlineEditor } from "../editor/NoteInlineEditor";
import type { NotePreviewData } from "./notePreviewShared";

export function NotePreviewContent({
	relPath,
	content,
	error,
}: NotePreviewData) {
	if (error) {
		return <div className="markdownEditorInfoEmpty">{error}</div>;
	}

	if (!content.trim()) {
		return <div className="markdownEditorInfoEmpty">Empty note</div>;
	}

	return (
		<div className="linkedNotePreviewText">
			<NoteInlineEditor
				markdown={content}
				relPath={relPath}
				mode="preview"
				onChange={() => {}}
				interactive={false}
				deferHeavyFeatures
			/>
		</div>
	);
}
