import type { LanguageFn } from "highlight.js";
import plaintext from "highlight.js/lib/languages/plaintext";

/**
 * Shared lazy loader for highlight.js grammar modules, used by both the
 * note editor (lowlight) and AI message rendering (hljs core). Grammars are
 * dynamic imports so they stay out of eager chunks; only the tiny plaintext
 * grammar is bundled statically so plain blocks never get auto-detected as
 * another language.
 */
export const PLAINTEXT_GRAMMAR: LanguageFn = plaintext;

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

/** Registry-level aliases, keyed by grammar module name. */
export const GRAMMAR_ALIASES: Readonly<Record<string, readonly string[]>> = {
	bash: ["shell", "sh", "zsh"],
	javascript: ["cjs", "js", "jsx", "mjs"],
	markdown: ["md"],
	plaintext: ["text", "txt", "mermaid"],
	python: ["py"],
	typescript: ["ts", "tsx"],
	xml: ["html", "svg"],
	yaml: ["yml"],
};

const GRAMMAR_NAME_BY_ALIAS = new Map<string, string>();
for (const name of [...Object.keys(GRAMMAR_LOADERS), "plaintext"]) {
	GRAMMAR_NAME_BY_ALIAS.set(name, name);
}
for (const [name, aliases] of Object.entries(GRAMMAR_ALIASES)) {
	for (const alias of aliases) {
		GRAMMAR_NAME_BY_ALIAS.set(alias, name);
	}
}

/** Maps a language or alias to its grammar module name, or null if unsupported. */
export function resolveGrammarName(
	language: string | null | undefined,
): string | null {
	if (!language) return "plaintext";
	return GRAMMAR_NAME_BY_ALIAS.get(language.toLowerCase()) ?? null;
}

const grammarLoads = new Map<string, Promise<LanguageFn | null>>();

/**
 * Loads the grammar module for `name` (a grammar module name, not an alias).
 * Cached; failed loads clear the cache entry so they can retry. Resolves to
 * null for unsupported names or failed loads.
 */
export function loadGrammar(name: string): Promise<LanguageFn | null> {
	if (name === "plaintext") return Promise.resolve(PLAINTEXT_GRAMMAR);
	const loader = GRAMMAR_LOADERS[name];
	if (!loader) return Promise.resolve(null);
	let load = grammarLoads.get(name);
	if (!load) {
		load = loader()
			.then((module) => module.default)
			.catch(() => {
				grammarLoads.delete(name);
				return null;
			});
		grammarLoads.set(name, load);
	}
	return load;
}
