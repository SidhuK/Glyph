import { i18n } from "../../i18n";
import type { UiAccent } from "../../lib/settings";
import { getAccentOptionColor } from "../../lib/uiAccent";

const ACCENT_OPTION_IDS = [
	"neutral",
	"glyph-orange",
	"glyph-red",
	"cerulean",
	"tropical-teal",
] as const satisfies readonly UiAccent[];

const ACCENT_LABEL_KEYS = {
	neutral: "neutral",
	"glyph-orange": "glyphOrange",
	"glyph-red": "glyphRed",
	cerulean: "cerulean",
	"tropical-teal": "tropicalTeal",
} as const satisfies Record<UiAccent, string>;

export function getAccentOptions(): Array<{
	id: UiAccent;
	label: string;
	color: string;
}> {
	return ACCENT_OPTION_IDS.map((id) => ({
		id,
		label: i18n.t(
			`settings.appearance:accent.options.${ACCENT_LABEL_KEYS[id]}`,
		),
		color: getAccentOptionColor(id),
	}));
}

export { getAccentPreviewColor } from "../../lib/uiAccent";
