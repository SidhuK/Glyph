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
	mermaid: plaintext,
	plaintext,
	python,
	rust,
	typescript,
	xml,
	yaml,
});

const CODE_BLOCK_LANGUAGE_ALIASES = {
	bash: ["shell", "sh", "zsh"],
	javascript: ["cjs", "js", "jsx", "mjs"],
	markdown: ["md"],
	plaintext: ["text", "txt"],
	python: ["py"],
	typescript: ["ts", "tsx"],
	xml: ["html", "svg"],
	yaml: ["yml"],
} as const;

lowlight.registerAlias(CODE_BLOCK_LANGUAGE_ALIASES);

const SUPPORTED_CODE_BLOCK_LANGUAGES = [
	"plaintext",
	"bash",
	"javascript",
	"typescript",
	"json",
	"markdown",
	"mermaid",
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
	{ label: "Mermaid", value: "mermaid" },
	{ label: "Python", value: "python" },
	{ label: "Rust", value: "rust" },
	{ label: "HTML / XML", value: "xml" },
	{ label: "YAML", value: "yaml" },
] as const;

const NORMALIZED_LANGUAGE_BY_ALIAS = new Map<
	string,
	SupportedCodeBlockLanguage
>(SUPPORTED_CODE_BLOCK_LANGUAGES.map((language) => [language, language]));

for (const [language, aliases] of Object.entries(CODE_BLOCK_LANGUAGE_ALIASES)) {
	for (const alias of aliases) {
		NORMALIZED_LANGUAGE_BY_ALIAS.set(
			alias,
			language as SupportedCodeBlockLanguage,
		);
	}
}

export function normalizeCodeBlockLanguage(
	language: string | null | undefined,
): SupportedCodeBlockLanguage | null {
	if (!language) return "plaintext";
	return NORMALIZED_LANGUAGE_BY_ALIAS.get(language.toLowerCase()) ?? null;
}

export function getCodeBlockLanguageLabel(
	language: string | null | undefined,
): string {
	if (!language) return "Plain text";
	const raw = language.trim();
	const normalized = normalizeCodeBlockLanguage(raw);
	if (!normalized && raw.length > 0) {
		return raw;
	}
	return (
		CODE_BLOCK_LANGUAGE_OPTIONS.find(
			(option) => option.value === (normalized ?? "plaintext"),
		)?.label ?? raw
	);
}

export const SyntaxHighlightedCodeBlock = CodeBlockLowlight.configure({
	lowlight,
	defaultLanguage: "plaintext",
	HTMLAttributes: {
		spellcheck: "false",
	},
});
