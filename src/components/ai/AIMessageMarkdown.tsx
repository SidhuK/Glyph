import { openUrl } from "@tauri-apps/plugin-opener";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { createEditorExtensions } from "../editor/extensions";
import { dispatchMarkdownLinkClick } from "../editor/markdown/editorEvents";

interface AIMessageMarkdownProps {
	markdown: string;
}

const MARKDOWN_VIEW_EXTENSIONS = createEditorExtensions({
	enableSlashCommand: false,
});

export function AIMessageMarkdown({ markdown }: AIMessageMarkdownProps) {
	const lastAppliedRef = useRef(markdown);
	const containerRef = useRef<HTMLDivElement>(null);
	const editor = useEditor({
		editable: false,
		extensions: MARKDOWN_VIEW_EXTENSIONS,
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
				if (href && !href.startsWith("#")) {
					event.preventDefault();
					dispatchMarkdownLinkClick({
						href,
						sourcePath: "",
					});
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

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const codeBlocks = container.querySelectorAll("pre");
		for (const pre of codeBlocks) {
			if (pre.querySelector(".aiCodeBlockHeader")) continue;

			const codeEl = pre.querySelector("code");
			const langClass = codeEl?.className.match(/language-(\w+)/);
			const lang = langClass?.[1] ?? "";

			const header = document.createElement("div");
			header.className = "aiCodeBlockHeader";

			if (lang) {
				const langLabel = document.createElement("span");
				langLabel.className = "aiCodeBlockLang";
				langLabel.textContent = lang;
				header.appendChild(langLabel);
			}

			const spacer = document.createElement("span");
			spacer.style.flex = "1";
			header.appendChild(spacer);

			const copyBtn = document.createElement("button");
			copyBtn.type = "button";
			copyBtn.className = "aiCodeBlockCopy";
			copyBtn.textContent = "Copy";
			copyBtn.addEventListener("click", () => {
				const text = codeEl?.textContent ?? pre.textContent ?? "";
				void navigator.clipboard.writeText(text).then(() => {
					copyBtn.textContent = "Copied!";
					setTimeout(() => {
						copyBtn.textContent = "Copy";
					}, 1500);
				});
			});
			header.appendChild(copyBtn);

			pre.style.position = "relative";
			pre.insertBefore(header, pre.firstChild);
		}
	}, [editor, markdown]);

	if (!editor) {
		return <div className="aiChatContent">{markdown}</div>;
	}

	return (
		<div className="aiMessageMarkdown" ref={containerRef}>
			<EditorContent editor={editor} />
		</div>
	);
}
