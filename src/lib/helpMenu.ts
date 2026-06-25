import { openUrl } from "@tauri-apps/plugin-opener";
import type { SettingsTab } from "../components/settings/settingsConfig";

export const GLYPH_LINKS = {
	website: "https://glyphformac.com",
	changelog: "https://glyphformac.com/changelog",
	privacy: "https://glyphformac.com/privacy",
	terms: "https://glyphformac.com/terms",
	discord: "https://discord.gg/cNqrBfFx7D",
	github: "https://github.com/SidhuK/Glyph",
	x: "https://x.com/karat_sidhu",
} as const;

const GLYPH_LINK_COMMAND_HANDLERS = {
	"open-glyph-website": GLYPH_LINKS.website,
	"open-glyph-changelog": GLYPH_LINKS.changelog,
	"open-glyph-privacy": GLYPH_LINKS.privacy,
	"open-glyph-terms": GLYPH_LINKS.terms,
	"open-glyph-discord": GLYPH_LINKS.discord,
	"open-glyph-github": GLYPH_LINKS.github,
	"open-glyph-x": GLYPH_LINKS.x,
} as const;

export function buildHelpMenuCommandHandlers(
	openGettingStarted: () => void,
	showWelcomeNote: () => void | Promise<void>,
	openSettings: (tab?: SettingsTab) => void,
): Record<string, () => void | Promise<void>> {
	return {
		"show-getting-started": openGettingStarted,
		"show-welcome-note": showWelcomeNote,
		"open-shortcuts-settings": () => openSettings("shortcuts"),
		...Object.fromEntries(
			Object.entries(GLYPH_LINK_COMMAND_HANDLERS).map(([commandId, url]) => [
				commandId,
				() => void openUrl(url),
			]),
		),
	};
}
