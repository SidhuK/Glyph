import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { loadSettings } from "../lib/settings";
import { type AppLanguage, normalizeAppLanguage } from "./locales";
import { defaultNS, loadLanguageBundle, namespaces, resources } from "./resources";

async function ensureLanguageLoaded(language: AppLanguage): Promise<void> {
	if (i18n.hasResourceBundle(language, defaultNS)) return;
	const bundle = await loadLanguageBundle(language);
	for (const [ns, values] of Object.entries(bundle)) {
		i18n.addResourceBundle(language, ns, values, true, true);
	}
}

export async function initI18n(): Promise<typeof i18n> {
	const settings = await loadSettings().catch(() => null);
	const language = normalizeAppLanguage(settings?.ui.language);

	if (i18n.isInitialized) {
		await ensureLanguageLoaded(language);
		await i18n.changeLanguage(language);
		return i18n;
	}

	await i18n.use(initReactI18next).init({
		resources:
			language === "en"
				? resources
				: { ...resources, [language]: await loadLanguageBundle(language) },
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

let requestedLanguage: AppLanguage | null = null;

export async function changeAppLanguage(language: string): Promise<void> {
	const next = normalizeAppLanguage(language);
	requestedLanguage = next;
	await ensureLanguageLoaded(next);
	// A newer request may have arrived while this bundle loaded; only the latest one applies.
	if (requestedLanguage === next && i18n.language !== next) {
		await i18n.changeLanguage(next);
	}
}

export { i18n };
