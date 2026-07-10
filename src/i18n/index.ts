import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { loadSettings } from "../lib/settings";
import { normalizeAppLanguage } from "./locales";
import { defaultNS, namespaces, resources } from "./resources";

export async function initI18n(): Promise<typeof i18n> {
	const settings = await loadSettings().catch(() => null);
	const language = normalizeAppLanguage(settings?.ui.language);

	if (i18n.isInitialized) {
		await i18n.changeLanguage(language);
		return i18n;
	}

	await i18n.use(initReactI18next).init({
		resources,
		lng: language,
		fallbackLng: "en",
		defaultNS,
		ns: [...namespaces],
		interpolation: {
			escapeValue: false,
		},
		returnNull: false,
	});

	return i18n;
}

export async function changeAppLanguage(language: string): Promise<void> {
	const next = normalizeAppLanguage(language);
	if (i18n.language !== next) {
		await i18n.changeLanguage(next);
	}
}

export { i18n };
