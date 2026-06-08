import { openUrl } from "@tauri-apps/plugin-opener";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdownLanguage from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { marked } from "marked";
import { memo, useEffect, useMemo, useRef } from "react";
import { dispatchMarkdownLinkClick } from "../editor/markdown/editorEvents";

interface AIMessageMarkdownProps {
	markdown: string;
	streaming?: boolean;
}

type CopyButtonElement = HTMLButtonElement & {
	__copyResetTimer?: number | null;
};

const CODE_BLOCK_PROCESSED_ATTR = "data-ai-code-block-enhanced";
const UNPROCESSED_CODE_BLOCK_SELECTOR = `pre:not([${CODE_BLOCK_PROCESSED_ATTR}])`;
const COPY_RESET_MS = 1500;

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdownLanguage);
hljs.registerLanguage("mermaid", plaintext);
hljs.registerLanguage("plaintext", plaintext);
hljs.registerLanguage("python", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);
hljs.registerAliases(["shell", "sh", "zsh"], { languageName: "bash" });
hljs.registerAliases(["cjs", "js", "jsx", "mjs"], {
	languageName: "javascript",
});
hljs.registerAliases(["md"], { languageName: "markdown" });
hljs.registerAliases(["text", "txt"], { languageName: "plaintext" });
hljs.registerAliases(["py"], { languageName: "python" });
hljs.registerAliases(["ts", "tsx"], { languageName: "typescript" });
hljs.registerAliases(["html", "svg"], { languageName: "xml" });
hljs.registerAliases(["yml"], { languageName: "yaml" });

function renderMarkdown(markdown: string): string {
	const html = marked.parse(markdown, {
		async: false,
		breaks: false,
		gfm: true,
	}) as string;
	return DOMPurify.sanitize(html, {
		ADD_ATTR: ["class"],
	});
}

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

function enhanceCodeBlock(pre: HTMLPreElement) {
	pre.setAttribute(CODE_BLOCK_PROCESSED_ATTR, "true");

	const codeEl = pre.querySelector("code");
	const langClass = codeEl?.className.match(/language-([\w-]+)/);
	const lang = langClass?.[1] ?? "";

	if (codeEl) {
		try {
			hljs.highlightElement(codeEl);
		} catch {
			// Keep the escaped code visible if highlight.js cannot parse a language.
		}
	}

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
			console.error("Clipboard API is unavailable for AI code block copy.");
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

export const AIMessageMarkdown = memo(function AIMessageMarkdown({
	markdown,
	streaming = false,
}: AIMessageMarkdownProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const html = useMemo(
		() => (streaming ? "" : renderMarkdown(markdown)),
		[markdown, streaming],
	);

	useEffect(() => {
		if (streaming) return;
		const container = containerRef.current;
		if (!container) return;
		const frameId = window.requestAnimationFrame(() => {
			const codeBlocks = container.querySelectorAll<HTMLPreElement>(
				UNPROCESSED_CODE_BLOCK_SELECTOR,
			);
			for (const pre of codeBlocks) {
				enhanceCodeBlock(pre);
			}
		});
		return () => {
			window.cancelAnimationFrame(frameId);
		};
	});

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const handleClick = (event: MouseEvent) => {
			const target = event.target as HTMLElement | null;
			const link = target?.closest("a") as HTMLAnchorElement | null;
			if (!link || !container.contains(link)) return;
			const href = link.getAttribute("href") ?? "";
			if (!href) return;
			if (href.startsWith("http://") || href.startsWith("https://")) {
				event.preventDefault();
				void openUrl(href);
				return;
			}
			if (!href.startsWith("#")) {
				event.preventDefault();
				dispatchMarkdownLinkClick({
					href,
					sourcePath: "",
				});
			}
		};
		container.addEventListener("click", handleClick);
		return () => {
			container.removeEventListener("click", handleClick);
		};
	}, []);

	if (streaming) {
		return <div className="aiChatContent">{markdown}</div>;
	}

	return (
		<div className="aiMessageMarkdown" ref={containerRef}>
			<div
				className="tiptapContentInline aiMessageMarkdownContent"
				// HTML is sanitized above and link clicks are handled at the wrapper.
				// biome-ignore lint/security/noDangerouslySetInnerHtml: AI Markdown is sanitized with DOMPurify before insertion.
				dangerouslySetInnerHTML={{ __html: html }}
			/>
		</div>
	);
});
