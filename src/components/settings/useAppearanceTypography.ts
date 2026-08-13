import { useCallback, useEffect, useMemo, useState } from "react";
import { applyUiTypography } from "../../lib/appearance";
import type { AppSettings, UiFontFamily, UiFontSize } from "../../lib/settings";
import { DURABLE_SETTINGS } from "../../lib/settings/definitions";
import {
	DEFAULT_FONT_FAMILY,
	loadAvailableFonts,
	loadAvailableMonospaceFonts,
} from "./appearanceOptions";
import { useSettingsValue } from "./useSettingsValue";

function includeSelectedFonts(
	fonts: string[],
	selectedFonts: string[],
): string[] {
	const missingFonts = Array.from(
		new Set(selectedFonts.filter((font) => !fonts.includes(font))),
	);
	return missingFonts.length ? [...missingFonts, ...fonts] : fonts;
}

interface UseAppearanceTypographyOptions {
	setError: (message: string) => void;
	isHydrated: boolean;
}

export function useAppearanceTypography({
	setError,
	isHydrated,
}: UseAppearanceTypographyOptions) {
	const fontFamily = useSettingsValue<UiFontFamily>(
		DEFAULT_FONT_FAMILY,
		DURABLE_SETTINGS.fontFamily.write,
		setError,
	);
	const editorFontFamily = useSettingsValue<UiFontFamily>(
		DEFAULT_FONT_FAMILY,
		DURABLE_SETTINGS.editorFontFamily.write,
		setError,
	);
	const monoFontFamily = useSettingsValue<UiFontFamily>(
		"JetBrains Mono",
		DURABLE_SETTINGS.monoFontFamily.write,
		setError,
	);
	const uiFontSize = useSettingsValue<UiFontSize>(
		14,
		DURABLE_SETTINGS.fontSize.write,
		setError,
	);
	const editorFontSize = useSettingsValue<UiFontSize>(
		16,
		DURABLE_SETTINGS.editorFontSize.write,
		setError,
	);
	const [availableFonts, setAvailableFonts] = useState<string[]>([
		DEFAULT_FONT_FAMILY,
	]);
	const [availableMonospaceFonts, setAvailableMonospaceFonts] = useState<
		string[]
	>(["JetBrains Mono"]);

	const typography = useMemo(
		() => ({
			fontFamily: fontFamily.value,
			editorFontFamily: editorFontFamily.value,
			monoFontFamily: monoFontFamily.value,
			uiFontSize: uiFontSize.value,
			editorFontSize: editorFontSize.value,
		}),
		[
			editorFontFamily.value,
			editorFontSize.value,
			fontFamily.value,
			monoFontFamily.value,
			uiFontSize.value,
		],
	);

	useEffect(() => {
		if (!isHydrated) return;
		applyUiTypography(typography);
	}, [isHydrated, typography]);

	useEffect(() => {
		let cancelled = false;
		void Promise.all([loadAvailableFonts(), loadAvailableMonospaceFonts()])
			.then(([fonts, monospaceFonts]) => {
				if (cancelled) return;
				setAvailableFonts(fonts);
				setAvailableMonospaceFonts(monospaceFonts);
			})
			.catch((cause: unknown) => {
				if (!cancelled)
					setError(cause instanceof Error ? cause.message : String(cause));
			});
		return () => {
			cancelled = true;
		};
	}, [setError]);

	const setInitialTypography = useCallback(
		(settings: AppSettings) => {
			fontFamily.setInitialValue(settings.ui.fontFamily);
			editorFontFamily.setInitialValue(settings.ui.editorFontFamily);
			monoFontFamily.setInitialValue(settings.ui.monoFontFamily);
			uiFontSize.setInitialValue(settings.ui.fontSize);
			editorFontSize.setInitialValue(settings.ui.editorFontSize);
		},
		[
			editorFontFamily.setInitialValue,
			editorFontSize.setInitialValue,
			fontFamily.setInitialValue,
			monoFontFamily.setInitialValue,
			uiFontSize.setInitialValue,
		],
	);

	return {
		...typography,
		availableFonts: includeSelectedFonts(availableFonts, [
			typography.fontFamily,
			typography.editorFontFamily,
		]),
		availableMonospaceFonts: includeSelectedFonts(availableMonospaceFonts, [
			typography.monoFontFamily,
		]),
		setInitialTypography,
		setFontFamily: fontFamily.setValue,
		setEditorFontFamily: editorFontFamily.setValue,
		setMonoFontFamily: monoFontFamily.setValue,
		setUiFontSize: uiFontSize.setValue,
		setEditorFontSize: editorFontSize.setValue,
		onFontFamilyChange: async (next: UiFontFamily) => fontFamily.onChange(next),
		onEditorFontFamilyChange: async (next: UiFontFamily) =>
			editorFontFamily.onChange(next),
		onMonoFontFamilyChange: async (next: UiFontFamily) =>
			monoFontFamily.onChange(next),
		onUiFontSizeChange: async (next: UiFontSize) => uiFontSize.onChange(next),
		onEditorFontSizeChange: async (next: UiFontSize) =>
			editorFontSize.onChange(next),
	};
}
