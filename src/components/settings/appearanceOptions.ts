export const DEFAULT_FONT_FAMILY = "Inter";
export const MIN_FONT_SIZE = 7;
export const MAX_FONT_SIZE = 40;
export const FONT_SIZE_OPTIONS = Array.from(
	{ length: MAX_FONT_SIZE - MIN_FONT_SIZE + 1 },
	(_, idx) => MIN_FONT_SIZE + idx,
);

const MAC_FONT_FALLBACKS = [
	"Inter",
	"SF Pro Text",
	"SF Pro Display",
	"Helvetica Neue",
	"Avenir Next",
	"Menlo",
	"Monaco",
	"Georgia",
	"Times New Roman",
	"Palatino",
	"Verdana",
	"Trebuchet MS",
	"Futura",
	"Gill Sans",
	"Charter",
];

type LocalFontRecord = {
	family?: string;
	fullName?: string;
};

type QueryLocalFontsWindow = Window & {
	queryLocalFonts?: () => Promise<LocalFontRecord[]>;
};

export async function loadAvailableFonts(): Promise<string[]> {
	const api = (window as QueryLocalFontsWindow).queryLocalFonts;
	if (!api) return MAC_FONT_FALLBACKS;
	try {
		const localFonts = await api();
		const uniq = new Set<string>();
		for (const font of localFonts) {
			const family = (font.family ?? font.fullName ?? "").trim();
			if (family) uniq.add(family);
		}
		const fonts = Array.from(uniq).sort((a, b) => a.localeCompare(b));
		return fonts.length ? fonts : MAC_FONT_FALLBACKS;
	} catch {
		return MAC_FONT_FALLBACKS;
	}
}
