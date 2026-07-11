import { type Editor, findChildren } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight } from "lowlight";
import { i18n } from "../../../i18n";
import {
	GRAMMAR_ALIASES,
	PLAINTEXT_GRAMMAR,
	loadGrammar,
	resolveGrammarName,
} from "../../../lib/highlightGrammars";

const lowlight = createLowlight();

// Plaintext is registered eagerly (it is tiny) so that plain/mermaid blocks
// never fall through to highlightAuto and get mis-detected as another
// language. All real grammars load on demand via ensureGrammar(). Aliases are
// just a name map, safe to register before the grammars they point at.
lowlight.register({ plaintext: PLAINTEXT_GRAMMAR });
lowlight.registerAlias(GRAMMAR_ALIASES);

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

/**
 * Loads and registers the grammar backing `language` if it is supported and
 * not yet registered. Returns null when nothing needs loading, otherwise a
 * promise resolving to whether the grammar was registered.
 */
function ensureGrammar(language: string): Promise<boolean> | null {
	const grammar = resolveGrammarName(language);
	if (!grammar || lowlight.registered(grammar)) return null;
	return loadGrammar(grammar).then((languageFn) => {
		if (!languageFn) return false;
		if (!lowlight.registered(grammar)) {
			lowlight.register(grammar, languageFn);
		}
		return true;
	});
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

// Derive UI-level aliases from the grammar alias table. Aliases that are
// themselves supported languages (html, svg, mermaid) keep their own entry so
// their labels stay distinct.
for (const [language, aliases] of Object.entries(GRAMMAR_ALIASES)) {
	const supported = NORMALIZED_LANGUAGE_BY_ALIAS.get(language);
	if (!supported) continue;
	for (const alias of aliases) {
		if (!NORMALIZED_LANGUAGE_BY_ALIAS.has(alias)) {
			NORMALIZED_LANGUAGE_BY_ALIAS.set(alias, supported);
		}
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
