import { EditorContent, useEditor } from "@tiptap/react";
import { memo, useEffect, useRef } from "react";
import { createEditorExtensions } from "../../editor/extensions";

interface NoteNodePreviewProps {
	markdown: string;
}

export const NoteNodePreview = memo(function NoteNodePreview({
	markdown,
}: NoteNodePreviewProps) {
	const lastAppliedRef = useRef(markdown);
	const editor = useEditor({
		editable: false,
		extensions: createEditorExtensions({ enableSlashCommand: false }),
		content: markdown,
		contentType: "markdown",
		editorProps: {
			attributes: {
				class: "canvasNotePreviewContent",
				spellcheck: "false",
			},
		},
	});

	useEffect(() => {
		if (!editor) return;
		if (markdown === lastAppliedRef.current) return;
		editor.commands.setContent(markdown, { contentType: "markdown" });
		lastAppliedRef.current = markdown;
	}, [editor, markdown]);

	if (!editor) {
		return <div className="canvasNotePreviewFallback">{markdown}</div>;
	}

	return (
		<div className="canvasNotePreview">
			<EditorContent editor={editor} />
		</div>
	);
});
