import { openUrl } from "@tauri-apps/plugin-opener";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import { marked } from "marked";
import { memo, useEffect, useMemo, useRef } from "react";
import {
	GRAMMAR_ALIASES,
	PLAINTEXT_GRAMMAR,
	loadGrammar,
	resolveGrammarName,
} from "../../lib/highlightGrammars";
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

// Grammars load lazily via ensureGrammar; aliases are just a name map and are
// safe to register before the grammars they point at.
hljs.registerLanguage("plaintext", PLAINTEXT_GRAMMAR);
for (const [languageName, aliases] of Object.entries(GRAMMAR_ALIASES)) {
	hljs.registerAliases([...aliases], { languageName });
}

async function ensureGrammar(language: string): Promise<void> {
	const grammar = resolveGrammarName(language);
	if (!grammar || hljs.getLanguage(grammar)) return;
	const languageFn = await loadGrammar(grammar);
	if (languageFn && !hljs.getLanguage(grammar)) {
		hljs.registerLanguage(grammar, languageFn);
	}
}

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
		void ensureGrammar(lang).then(() => {
			try {
				hljs.highlightElement(codeEl);
			} catch {
				// Keep the escaped code visible if highlight.js cannot parse a language.
			}
		});
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
		if (!html) return;
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
	}, [html, streaming]);

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
