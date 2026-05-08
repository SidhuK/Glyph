import { openUrl } from "@tauri-apps/plugin-opener";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { createEditorExtensions } from "../editor/extensions";
import { dispatchMarkdownLinkClick } from "../editor/markdown/editorEvents";

interface AIMessageMarkdownProps {
	markdown: string;
}

type CopyButtonElement = HTMLButtonElement & {
	__copyResetTimer?: number | null;
};

const MARKDOWN_VIEW_EXTENSIONS = createEditorExtensions({
	enableEditingExtensions: false,
	enableSlashCommand: false,
});

const CODE_BLOCK_PROCESSED_ATTR = "data-ai-code-block-enhanced";
const UNPROCESSED_CODE_BLOCK_SELECTOR = `pre:not([${CODE_BLOCK_PROCESSED_ATTR}])`;
const COPY_RESET_MS = 1500;

function setCopyButtonFeedback(
	button: CopyButtonElement,
	label: "Copy" | "Copied!" | "Failed",
) {
	button.textContent = label;
	if (button.__copyResetTimer != null) {
		window.clearTimeout(button.__copyResetTimer);
	}
	if (label === "Copy") {
		button.__copyResetTimer = null;
		return;
	}
	button.__copyResetTimer = window.setTimeout(() => {
		button.textContent = "Copy";
		button.__copyResetTimer = null;
	}, COPY_RESET_MS);
}

export function AIMessageMarkdown({ markdown }: AIMessageMarkdownProps) {
	const lastAppliedRef = useRef(markdown);
	const lastProcessedMarkdownRef = useRef("");
	const processFrameRef = useRef<number | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const latestMarkdownRef = useRef(markdown);
	latestMarkdownRef.current = markdown;
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
		if (!editor) return;
		const container = containerRef.current;
		if (!container) return;
		if (
			markdown === lastProcessedMarkdownRef.current &&
			!container.querySelector(UNPROCESSED_CODE_BLOCK_SELECTOR)
		) {
			return;
		}

		const frameId = window.requestAnimationFrame(() => {
			processFrameRef.current = null;
			const currentContainer = containerRef.current;
			if (!currentContainer) return;

			const codeBlocks = currentContainer.querySelectorAll<HTMLPreElement>(
				UNPROCESSED_CODE_BLOCK_SELECTOR,
			);
			if (codeBlocks.length === 0) {
				lastProcessedMarkdownRef.current = latestMarkdownRef.current;
				return;
			}

			for (const pre of codeBlocks) {
				pre.setAttribute(CODE_BLOCK_PROCESSED_ATTR, "true");

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

				const copyBtn = document.createElement("button") as CopyButtonElement;
				copyBtn.type = "button";
				copyBtn.className = "aiCodeBlockCopy";
				copyBtn.textContent = "Copy";
				copyBtn.addEventListener("click", () => {
					const text = codeEl?.textContent ?? "";
					const clipboard = navigator.clipboard;
					if (!clipboard?.writeText) {
						console.error(
							"Clipboard API is unavailable for AI code block copy.",
						);
						setCopyButtonFeedback(copyBtn, "Failed");
						return;
					}
					void clipboard.writeText(text).then(
						() => {
							setCopyButtonFeedback(copyBtn, "Copied!");
						},
						(error: unknown) => {
							console.error("Failed to copy AI code block contents.", error);
							setCopyButtonFeedback(copyBtn, "Failed");
						},
					);
				});
				header.appendChild(copyBtn);

				pre.style.position = "relative";
				pre.insertBefore(header, pre.firstChild);
			}

			lastProcessedMarkdownRef.current = latestMarkdownRef.current;
		});

		processFrameRef.current = frameId;
		return () => {
			if (processFrameRef.current == null) return;
			window.cancelAnimationFrame(processFrameRef.current);
			processFrameRef.current = null;
		};
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
