export const SUPPORTED_LANGUAGE_IDS = [
	"en",
	"es",
	"ja",
	"de",
	"fr",
	"ko",
	"pt-BR",
] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGE_IDS)[number];

export interface LanguageOption {
	id: AppLanguage;
	nativeLabel: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
	{ id: "en", nativeLabel: "English" },
	{ id: "es", nativeLabel: "Español" },
	{ id: "ja", nativeLabel: "日本語" },
	{ id: "de", nativeLabel: "Deutsch" },
	{ id: "fr", nativeLabel: "Français" },
	{ id: "ko", nativeLabel: "한국어" },
	{ id: "pt-BR", nativeLabel: "Português (Brasil)" },
];

const SUPPORTED_LANGUAGE_SET = new Set<string>(SUPPORTED_LANGUAGE_IDS);

export function isAppLanguage(value: unknown): value is AppLanguage {
	return typeof value === "string" && SUPPORTED_LANGUAGE_SET.has(value);
}

export function normalizeAppLanguage(value: unknown): AppLanguage {
	return isAppLanguage(value) ? value : "en";
}
