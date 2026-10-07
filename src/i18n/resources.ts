import type { Resource, ResourceLanguage } from "i18next";
import type { AppLanguage } from "./locales";

export const defaultNS = "shell";

export const namespaces = [
	"shell",
	"commands",
	"settings.general",
	"settings.appearance",
	"settings.typography",
	"settings.sidebar",
	"settings.ai",
	"settings.search",
	"editor",
	"menu",
] as const;

type LocaleModule = Record<string, unknown>;

const englishModules = import.meta.glob<LocaleModule>("./locales/en/*.json", {
	eager: true,
	import: "default",
});

// Only the active language is ever needed beside the English fallback, so the rest load on demand.
const localeLoaders = import.meta.glob<LocaleModule>(
	["./locales/*/*.json", "!./locales/en/*.json"],
	{ import: "default" },
);

function missingResource(path: string): never {
	throw new Error(`Missing i18n resource: ${path}`);
}

function buildEnglishBundle(): ResourceLanguage {
	const bundle: ResourceLanguage = {};
	for (const ns of namespaces) {
		const path = `./locales/en/${ns}.json`;
		bundle[ns] = englishModules[path] ?? missingResource(path);
	}
	return bundle;
}

export const resources = { en: buildEnglishBundle() } satisfies Resource;

export async function loadLanguageBundle(language: AppLanguage): Promise<ResourceLanguage> {
	if (language === "en") return resources.en;
	const entries = await Promise.all(
		namespaces.map(async (ns) => {
			const path = `./locales/${language}/${ns}.json`;
			const load = localeLoaders[path] ?? missingResource(path);
			return [ns, await load()] as const;
		}),
	);
	return Object.fromEntries(entries);
}
