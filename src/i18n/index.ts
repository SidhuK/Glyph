import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { loadSettings } from "../lib/settings";
import { normalizeAppLanguage, resolveSupportedLanguage } from "./locales";
import { defaultNS, namespaces, resources } from "./resources";

function systemLanguages(): string[] {
	if (typeof navigator === "undefined") return [];
	return Array.from(
		navigator.languages?.length ? navigator.languages : [navigator.language],
	).filter(Boolean);
}

export function resolveLanguagePreference(language: string): string {
	return resolveSupportedLanguage(
		normalizeAppLanguage(language),
		systemLanguages(),
	);
}

export async function initI18n(): Promise<void> {
	const settings = await loadSettings().catch(() => null);
	const language = settings?.ui.language ?? "system";
	const resolvedLanguage = resolveSupportedLanguage(
		language,
		systemLanguages(),
	);

	if (i18n.isInitialized) {
		await i18n.changeLanguage(resolvedLanguage);
		return;
	}

	await i18n.use(initReactI18next).init({
		resources,
		lng: resolvedLanguage,
		fallbackLng: "en",
		defaultNS,
		ns: namespaces,
		interpolation: {
			escapeValue: false,
		},
		returnNull: false,
	});
}

export { i18n };
