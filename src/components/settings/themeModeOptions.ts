import { i18n } from "../../i18n";
import type { ThemeMode } from "../../lib/settings";

const THEME_MODE_VALUES = [
	"system",
	"light",
	"dark",
] as const satisfies readonly ThemeMode[];

export function getThemeModeOptions(): Array<{
	value: ThemeMode;
	label: string;
	description: string;
}> {
	return THEME_MODE_VALUES.map((value) => ({
		value,
		label: i18n.t(`settings.appearance:theme.modes.${value}.label`),
		description: i18n.t(`settings.appearance:theme.modes.${value}.description`),
	}));
}
