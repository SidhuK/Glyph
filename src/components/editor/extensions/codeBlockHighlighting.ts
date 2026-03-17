import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import bash from "highlight.js/lib/languages/bash";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";

const lowlight = createLowlight();

lowlight.register({
	bash,
	javascript,
	json,
	markdown,
	plaintext,
	python,
	rust,
	typescript,
	xml,
	yaml,
});

lowlight.registerAlias({
	bash: ["shell", "sh", "zsh"],
	javascript: ["cjs", "js", "jsx", "mjs"],
	markdown: ["md"],
	plaintext: ["text", "txt"],
	python: ["py"],
	typescript: ["ts", "tsx"],
	xml: ["html", "svg"],
	yaml: ["yml"],
});

export const SUPPORTED_CODE_BLOCK_LANGUAGES = [
	"plaintext",
	"bash",
	"javascript",
	"typescript",
	"json",
	"markdown",
	"python",
	"rust",
	"xml",
	"yaml",
] as const;

export type SupportedCodeBlockLanguage =
	(typeof SUPPORTED_CODE_BLOCK_LANGUAGES)[number];

export const CODE_BLOCK_LANGUAGE_OPTIONS: ReadonlyArray<{
	label: string;
	value: SupportedCodeBlockLanguage;
}> = [
	{ label: "Plain text", value: "plaintext" },
	{ label: "Bash", value: "bash" },
	{ label: "JavaScript", value: "javascript" },
	{ label: "TypeScript", value: "typescript" },
	{ label: "JSON", value: "json" },
	{ label: "Markdown", value: "markdown" },
	{ label: "Python", value: "python" },
	{ label: "Rust", value: "rust" },
	{ label: "HTML / XML", value: "xml" },
	{ label: "YAML", value: "yaml" },
] as const;

export function normalizeCodeBlockLanguage(
	language: string | null | undefined,
): SupportedCodeBlockLanguage {
	switch ((language ?? "").toLowerCase()) {
		case "bash":
		case "shell":
		case "sh":
		case "zsh":
			return "bash";
		case "javascript":
		case "cjs":
		case "js":
		case "jsx":
		case "mjs":
			return "javascript";
		case "json":
			return "json";
		case "markdown":
		case "md":
			return "markdown";
		case "python":
		case "py":
			return "python";
		case "rust":
			return "rust";
		case "typescript":
		case "ts":
		case "tsx":
			return "typescript";
		case "html":
		case "svg":
		case "xml":
			return "xml";
		case "yaml":
		case "yml":
			return "yaml";
		case "plaintext":
		case "text":
		case "txt":
		default:
			return "plaintext";
	}
}

export const SyntaxHighlightedCodeBlock = CodeBlockLowlight.configure({
	lowlight,
	defaultLanguage: "plaintext",
});
