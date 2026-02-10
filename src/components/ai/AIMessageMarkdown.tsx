import { openUrl } from "@tauri-apps/plugin-opener";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { createEditorExtensions } from "../editor/extensions";

interface AIMessageMarkdownProps {
	markdown: string;
}

export function AIMessageMarkdown({ markdown }: AIMessageMarkdownProps) {
	const lastAppliedRef = useRef(markdown);
	const editor = useEditor({
		editable: false,
		extensions: createEditorExtensions({ enableSlashCommand: false }),
		content: markdown,
		contentType: "markdown",
		editorProps: {
			attributes: {
				class: "tiptapContentInline aiMessageMarkdownContent",
				spellcheck: "false",
			},
			handleClick: (_view, _pos, event) => {
				const target = event.target as HTMLElement | null;
				const link = target?.closest("a") as HTMLAnchorElement | null;
				const href = link?.getAttribute("href") ?? "";
				if (
					href &&
					(href.startsWith("http://") || href.startsWith("https://"))
				) {
					event.preventDefault();
					void openUrl(href);
					return true;
				}
				return false;
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
		return <div className="aiChatContent">{markdown}</div>;
	}

	return (
		<div className="aiMessageMarkdown">
			<EditorContent editor={editor} />
		</div>
	);
}
