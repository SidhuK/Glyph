import { i18n } from "../../i18n";
import type { UiCornerRadiusStyle } from "../../lib/settings";

const CORNER_RADIUS_VALUES = [
	"sharp",
	"default",
	"round",
] as const satisfies readonly UiCornerRadiusStyle[];

export function getCornerRadiusOptions(): Array<{
	value: UiCornerRadiusStyle;
	label: string;
	description: string;
}> {
	return CORNER_RADIUS_VALUES.map((value) => ({
		value,
		label: i18n.t(`settings.appearance:shape.options.${value}.label`),
		description: i18n.t(
			`settings.appearance:shape.options.${value}.description`,
		),
	}));
}
