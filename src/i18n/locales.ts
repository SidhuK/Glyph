export const SUPPORTED_LANGUAGE_IDS = [
	"en",
	"es",
	"de",
	"fr",
	"pt-BR",
	"ja",
	"ko",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGE_IDS)[number];
export type AppLanguage = "system" | SupportedLanguage;

export interface LanguageOption {
	id: AppLanguage;
	label: string;
	nativeLabel: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
	{ id: "system", label: "System", nativeLabel: "System" },
	{ id: "en", label: "English", nativeLabel: "English" },
	{ id: "es", label: "Spanish", nativeLabel: "Español" },
	{ id: "de", label: "German", nativeLabel: "Deutsch" },
	{ id: "fr", label: "French", nativeLabel: "Français" },
	{
		id: "pt-BR",
		label: "Portuguese (Brazil)",
		nativeLabel: "Português (Brasil)",
	},
	{ id: "ja", label: "Japanese", nativeLabel: "日本語" },
	{ id: "ko", label: "Korean", nativeLabel: "한국어" },
];

const SUPPORTED_LANGUAGE_SET = new Set<string>(SUPPORTED_LANGUAGE_IDS);
const APP_LANGUAGE_SET = new Set<string>(["system", ...SUPPORTED_LANGUAGE_IDS]);

export function isSupportedLanguage(
	value: unknown,
): value is SupportedLanguage {
	return typeof value === "string" && SUPPORTED_LANGUAGE_SET.has(value);
}

export function isAppLanguage(value: unknown): value is AppLanguage {
	return typeof value === "string" && APP_LANGUAGE_SET.has(value);
}

export function normalizeAppLanguage(value: unknown): AppLanguage {
	return isAppLanguage(value) ? value : "system";
}

function baseLanguageOf(language: string): string {
	return language.split("-")[0]?.toLowerCase() ?? language.toLowerCase();
}

export function resolveSupportedLanguage(
	preference: AppLanguage,
	systemLanguages: readonly string[] = [],
): SupportedLanguage {
	if (preference !== "system") return preference;

	for (const language of systemLanguages) {
		if (isSupportedLanguage(language)) return language;
		const baseLanguage = baseLanguageOf(language);
		const match = SUPPORTED_LANGUAGE_IDS.find(
			(supported) => baseLanguageOf(supported) === baseLanguage,
		);
		if (match) return match;
	}

	return "en";
}
