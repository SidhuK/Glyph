import { NoteInlineEditor } from "../editor/NoteInlineEditor";
import type { NotePreviewData } from "./notePreviewShared";

export function NotePreviewContent(data: NotePreviewData) {
	if (data.status === "error") {
		return <div className="markdownEditorInfoEmpty">{data.message}</div>;
	}

	if (!data.content.trim()) {
		return <div className="markdownEditorInfoEmpty">Empty note</div>;
	}

	return (
		<div className="linkedNotePreviewText">
			<NoteInlineEditor
				markdown={data.content}
				relPath={data.relPath}
				mode="preview"
				onChange={() => {}}
				interactive={false}
				deferHeavyFeatures
			/>
		</div>
	);
}
