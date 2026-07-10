import type { Resource } from "i18next";
import { SUPPORTED_LANGUAGE_IDS } from "./locales";

export const defaultNS = "shell";

export const namespaces = [
	"shell",
	"commands",
	"settings.general",
	"settings.appearance",
	"settings.search",
	"editor",
	"menu",
] as const;

export type I18nNamespace = (typeof namespaces)[number];

const localeModules = import.meta.glob("./locales/*/*.json", {
	eager: true,
	import: "default",
}) as Record<string, Record<string, unknown>>;

function buildResources(): Resource {
	const resources: Resource = {};
	for (const language of SUPPORTED_LANGUAGE_IDS) {
		const bundle: Record<string, Record<string, unknown>> = {};
		for (const ns of namespaces) {
			const path = `./locales/${language}/${ns}.json`;
			const module = localeModules[path];
			if (!module) {
				throw new Error(`Missing i18n resource: ${path}`);
			}
			bundle[ns] = module;
		}
		resources[language] = bundle;
	}
	return resources;
}

export const resources = buildResources() satisfies Resource;
