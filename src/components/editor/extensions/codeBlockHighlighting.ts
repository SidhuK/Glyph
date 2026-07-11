import { type Editor, findChildren } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import type { LanguageFn } from "highlight.js";
import plaintext from "highlight.js/lib/languages/plaintext";
import { createLowlight } from "lowlight";
import { i18n } from "../../../i18n";

const lowlight = createLowlight();

// Plaintext is registered eagerly (it is tiny) so that plain/mermaid blocks
// never fall through to highlightAuto and get mis-detected as another
// language. All real grammars load on demand via ensureGrammar().
lowlight.register({ plaintext });

const CODE_BLOCK_LANGUAGE_ALIASES = {
	bash: ["shell", "sh", "zsh"],
	javascript: ["cjs", "js", "jsx", "mjs"],
	markdown: ["md"],
	plaintext: ["text", "txt"],
	python: ["py"],
	typescript: ["ts", "tsx"],
	yaml: ["yml"],
} as const;

// Lowlight resolves aliases lazily, so these are safe to register before the
// grammars themselves. html/svg/mermaid map onto the grammars that back them.
lowlight.registerAlias({
	...CODE_BLOCK_LANGUAGE_ALIASES,
	plaintext: [...CODE_BLOCK_LANGUAGE_ALIASES.plaintext, "mermaid"],
	xml: ["html", "svg"],
});

const SUPPORTED_CODE_BLOCK_LANGUAGES = [
	"plaintext",
	"bash",
	"html",
	"javascript",
	"typescript",
	"json",
	"markdown",
	"mermaid",
	"python",
	"rust",
	"svg",
	"xml",
	"yaml",
] as const;

export type SupportedCodeBlockLanguage =
	(typeof SUPPORTED_CODE_BLOCK_LANGUAGES)[number];

// The highlight.js grammar module that backs each supported language.
const GRAMMAR_BY_LANGUAGE: Record<SupportedCodeBlockLanguage, string> = {
	bash: "bash",
	html: "xml",
	javascript: "javascript",
	json: "json",
	markdown: "markdown",
	mermaid: "plaintext",
	plaintext: "plaintext",
	python: "python",
	rust: "rust",
	svg: "xml",
	typescript: "typescript",
	xml: "xml",
	yaml: "yaml",
};

const GRAMMAR_LOADERS: Record<string, () => Promise<{ default: LanguageFn }>> =
	{
		bash: () => import("highlight.js/lib/languages/bash"),
		javascript: () => import("highlight.js/lib/languages/javascript"),
		json: () => import("highlight.js/lib/languages/json"),
		markdown: () => import("highlight.js/lib/languages/markdown"),
		python: () => import("highlight.js/lib/languages/python"),
		rust: () => import("highlight.js/lib/languages/rust"),
		typescript: () => import("highlight.js/lib/languages/typescript"),
		xml: () => import("highlight.js/lib/languages/xml"),
		yaml: () => import("highlight.js/lib/languages/yaml"),
	};

const grammarLoads = new Map<string, Promise<boolean>>();

/**
 * Loads and registers the grammar backing `language` if it is supported and
 * not yet registered. Returns null when nothing needs loading, otherwise a
 * promise resolving to whether the grammar was registered.
 */
function ensureGrammar(language: string): Promise<boolean> | null {
	const normalized = normalizeCodeBlockLanguage(language);
	if (!normalized) return null;
	const grammar = GRAMMAR_BY_LANGUAGE[normalized];
	if (lowlight.registered(grammar)) return null;
	let load = grammarLoads.get(grammar);
	if (!load) {
		load = GRAMMAR_LOADERS[grammar]()
			.then((module) => {
				lowlight.register(grammar, module.default);
				return true;
			})
			.catch(() => {
				grammarLoads.delete(grammar);
				return false;
			});
		grammarLoads.set(grammar, load);
	}
	return load;
}

function codeBlocksIn(editor: Editor) {
	return findChildren(
		editor.state.doc,
		(node) => node.type.name === "codeBlock",
	);
}

/**
 * The lowlight plugin only recomputes decorations on doc changes, so after a
 * grammar registers asynchronously we dispatch a no-op setNodeMarkup on each
 * code block to force a re-highlight. Content and attrs are unchanged.
 */
function refreshCodeBlockDecorations(editor: Editor) {
	const { tr } = editor.state;
	for (const block of codeBlocksIn(editor)) {
		tr.setNodeMarkup(block.pos, undefined, { ...block.node.attrs });
	}
	if (tr.steps.length > 0) {
		tr.setMeta("addToHistory", false);
		editor.view.dispatch(tr);
	}
}

function loadGrammarsForDoc(editor: Editor) {
	const languages = new Set<string>();
	for (const block of codeBlocksIn(editor)) {
		languages.add(block.node.attrs.language || "plaintext");
	}
	for (const language of languages) {
		ensureGrammar(language)?.then((registered) => {
			if (registered && !editor.isDestroyed) {
				refreshCodeBlockDecorations(editor);
			}
		});
	}
}

const CODE_BLOCK_LANGUAGE_OPTION_ORDER = [
	"plaintext",
	"bash",
	"javascript",
	"typescript",
	"json",
	"markdown",
	"mermaid",
	"python",
	"rust",
	"html",
	"svg",
	"xml",
	"yaml",
] as const satisfies readonly SupportedCodeBlockLanguage[];

export function getCodeBlockLanguageOptions(): ReadonlyArray<{
	label: string;
	value: SupportedCodeBlockLanguage;
}> {
	return CODE_BLOCK_LANGUAGE_OPTION_ORDER.map((value) => ({
		value,
		label: i18n.t(`editor:codeBlock.languages.${value}`),
	}));
}

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
	if (!language) {
		return i18n.t("editor:codeBlock.languages.plaintext");
	}
	const raw = language.trim();
	const normalized = normalizeCodeBlockLanguage(raw);
	if (!normalized && raw.length > 0) {
		return raw;
	}
	const value = normalized ?? "plaintext";
	return i18n.t(`editor:codeBlock.languages.${value}`);
}

export const SyntaxHighlightedCodeBlock = CodeBlockLowlight.extend({
	onCreate() {
		loadGrammarsForDoc(this.editor);
	},
	onUpdate() {
		loadGrammarsForDoc(this.editor);
	},
}).configure({
	lowlight,
	defaultLanguage: "plaintext",
	HTMLAttributes: {
		spellcheck: "false",
	},
});
