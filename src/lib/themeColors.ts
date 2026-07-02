const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const SHORT_HEX_COLOR_PATTERN = /^#[0-9a-f]{3}$/i;

export function isHexColor(value: unknown): value is string {
	return (
		typeof value === "string" &&
		(HEX_COLOR_PATTERN.test(value) || SHORT_HEX_COLOR_PATTERN.test(value))
	);
}

export function normalizeThemeColorHex(color: string): string {
	if (!isHexColor(color)) {
		throw new Error(`Invalid theme color: ${color}`);
	}
	const trimmed = color.trim();
	if (SHORT_HEX_COLOR_PATTERN.test(trimmed)) {
		const [, r, g, b] = trimmed;
		return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
	}
	return trimmed.toUpperCase();
}

export function tryNormalizeThemeColorHex(color: string): string | null {
	return isHexColor(color) ? normalizeThemeColorHex(color) : null;
}

export function normalizeThemeColorForInput(color: string): string {
	return normalizeThemeColorHex(color).toLowerCase();
}

export type UiThemeColorMode = "light" | "dark";
export type UiThemeColorField = "background" | "foreground";

export interface UiThemeModeColorOverrides {
	background: string | null;
	foreground: string | null;
}

export interface UiThemeColorOverrides {
	light: UiThemeModeColorOverrides;
	dark: UiThemeModeColorOverrides;
}

export type UiThemeColorOverridesPatch = {
	light?: Partial<UiThemeModeColorOverrides>;
	dark?: Partial<UiThemeModeColorOverrides>;
};

export const DEFAULT_UI_THEME_COLOR_OVERRIDES: UiThemeColorOverrides = {
	light: {
		background: null,
		foreground: null,
	},
	dark: {
		background: null,
		foreground: null,
	},
};

export function asNullableThemeColorValue(value: unknown): string | null {
	return isHexColor(value) ? normalizeThemeColorHex(value) : null;
}

function asThemeColorPatchValue(value: unknown): string | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	return asNullableThemeColorValue(value) ?? undefined;
}

function hasThemeColorPatchValue(patch: UiThemeColorOverridesPatch): boolean {
	return (
		patch.light?.background !== undefined ||
		patch.light?.foreground !== undefined ||
		patch.dark?.background !== undefined ||
		patch.dark?.foreground !== undefined
	);
}

export function asThemeColorOverridesPatch(
	value: unknown,
): UiThemeColorOverridesPatch | null {
	if (!value || typeof value !== "object") return null;
	const patch = value as UiThemeColorOverridesPatch;
	const light =
		patch.light && typeof patch.light === "object" ? patch.light : undefined;
	const dark =
		patch.dark && typeof patch.dark === "object" ? patch.dark : undefined;
	if (!light && !dark) return null;
	const result = {
		light: light
			? {
					background: asThemeColorPatchValue(light.background),
					foreground: asThemeColorPatchValue(light.foreground),
				}
			: undefined,
		dark: dark
			? {
					background: asThemeColorPatchValue(dark.background),
					foreground: asThemeColorPatchValue(dark.foreground),
				}
			: undefined,
	};
	return hasThemeColorPatchValue(result) ? result : null;
}

export function mergeThemeColorOverrides(
	base: UiThemeColorOverrides,
	patch: UiThemeColorOverridesPatch | null | undefined,
): UiThemeColorOverrides {
	if (!patch) return base;
	return {
		light: {
			background:
				patch.light?.background !== undefined
					? patch.light.background
					: base.light.background,
			foreground:
				patch.light?.foreground !== undefined
					? patch.light.foreground
					: base.light.foreground,
		},
		dark: {
			background:
				patch.dark?.background !== undefined
					? patch.dark.background
					: base.dark.background,
			foreground:
				patch.dark?.foreground !== undefined
					? patch.dark.foreground
					: base.dark.foreground,
		},
	};
}

export function withThemeColorOverride(
	overrides: UiThemeColorOverrides,
	mode: UiThemeColorMode,
	field: UiThemeColorField,
	color: string | null,
): UiThemeColorOverrides {
	return mergeThemeColorOverrides(overrides, {
		[mode]: { [field]: color },
	});
}

export function resolveUiThemeModeColors(
	overrides: UiThemeModeColorOverrides,
	defaults: { background: string; foreground: string },
): { background: string; foreground: string } {
	return {
		background: overrides.background
			? normalizeThemeColorHex(overrides.background)
			: normalizeThemeColorHex(defaults.background),
		foreground: overrides.foreground
			? normalizeThemeColorHex(overrides.foreground)
			: normalizeThemeColorHex(defaults.foreground),
	};
}
