import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useState,
} from "react";
import {
	type UiTypographyPreferences,
	applyUiTypography,
} from "../../lib/appearance";
import {
	type UiFontFamily,
	type UiFontSize,
	loadSettings,
	setUiEditorFontFamily,
	setUiEditorFontSize,
	setUiFontFamily,
	setUiFontSize,
	setUiMonoFontFamily,
} from "../../lib/settings";
import {
	DEFAULT_FONT_FAMILY,
	loadAvailableFonts,
	loadAvailableMonospaceFonts,
} from "./appearanceOptions";

function includeSelectedFonts(
	fonts: string[],
	selectedFonts: string[],
): string[] {
	const missingFonts = Array.from(
		new Set(selectedFonts.filter((font) => !fonts.includes(font))),
	);
	return missingFonts.length ? [...missingFonts, ...fonts] : fonts;
}

function applyAndSetTypography(
	next: UiTypographyPreferences,
	setFontFamilyState: Dispatch<SetStateAction<UiFontFamily>>,
	setEditorFontFamilyState: Dispatch<SetStateAction<UiFontFamily>>,
	setMonoFontFamilyState: Dispatch<SetStateAction<UiFontFamily>>,
	setUiFontSizeState: Dispatch<SetStateAction<UiFontSize>>,
	setEditorFontSizeState: Dispatch<SetStateAction<UiFontSize>>,
): void {
	setFontFamilyState(next.fontFamily);
	setEditorFontFamilyState(next.editorFontFamily);
	setMonoFontFamilyState(next.monoFontFamily);
	setUiFontSizeState(next.uiFontSize);
	setEditorFontSizeState(next.editorFontSize);
	applyUiTypography(next);
}

interface UseAppearanceTypographyOptions {
	setError: Dispatch<SetStateAction<string>>;
}

export function useAppearanceTypography({
	setError,
}: UseAppearanceTypographyOptions) {
	const [fontFamily, setFontFamilyState] =
		useState<UiFontFamily>(DEFAULT_FONT_FAMILY);
	const [editorFontFamily, setEditorFontFamilyState] =
		useState<UiFontFamily>(DEFAULT_FONT_FAMILY);
	const [monoFontFamily, setMonoFontFamilyState] =
		useState<UiFontFamily>("JetBrains Mono");
	const [uiFontSize, setUiFontSizeState] = useState<UiFontSize>(14);
	const [editorFontSize, setEditorFontSizeState] = useState<UiFontSize>(16);
	const [availableFonts, setAvailableFonts] = useState<string[]>([
		DEFAULT_FONT_FAMILY,
	]);
	const [availableMonospaceFonts, setAvailableMonospaceFonts] = useState<
		string[]
	>(["JetBrains Mono"]);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [settings, fonts, monoFonts] = await Promise.all([
					loadSettings(),
					loadAvailableFonts(),
					loadAvailableMonospaceFonts(),
				]);
				if (cancelled) return;
				const typography = {
					fontFamily: settings.ui.fontFamily,
					editorFontFamily: settings.ui.editorFontFamily,
					monoFontFamily: settings.ui.monoFontFamily,
					uiFontSize: settings.ui.fontSize,
					editorFontSize: settings.ui.editorFontSize,
				};
				applyAndSetTypography(
					typography,
					setFontFamilyState,
					setEditorFontFamilyState,
					setMonoFontFamilyState,
					setUiFontSizeState,
					setEditorFontSizeState,
				);
				setAvailableFonts(
					includeSelectedFonts(fonts, [
						settings.ui.fontFamily,
						settings.ui.editorFontFamily,
					]),
				);
				setAvailableMonospaceFonts(
					monoFonts.includes(settings.ui.monoFontFamily)
						? monoFonts
						: [settings.ui.monoFontFamily, ...monoFonts],
				);
			} catch (e) {
				if (!cancelled) {
					setError(e instanceof Error ? e.message : "Failed to load settings");
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [setError]);

	const restoreTypography = useCallback((previous: UiTypographyPreferences) => {
		applyAndSetTypography(
			previous,
			setFontFamilyState,
			setEditorFontFamilyState,
			setMonoFontFamilyState,
			setUiFontSizeState,
			setEditorFontSizeState,
		);
	}, []);

	const onFontFamilyChange = useCallback(
		async (next: UiFontFamily) => {
			setError("");
			const previous = {
				fontFamily,
				editorFontFamily,
				monoFontFamily,
				uiFontSize,
				editorFontSize,
			};
			setFontFamilyState(next);
			applyUiTypography({ ...previous, fontFamily: next });
			try {
				await setUiFontFamily(next);
			} catch (e) {
				restoreTypography(previous);
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[
			editorFontFamily,
			editorFontSize,
			fontFamily,
			monoFontFamily,
			restoreTypography,
			setError,
			uiFontSize,
		],
	);

	const onEditorFontFamilyChange = useCallback(
		async (next: UiFontFamily) => {
			setError("");
			const previous = {
				fontFamily,
				editorFontFamily,
				monoFontFamily,
				uiFontSize,
				editorFontSize,
			};
			setEditorFontFamilyState(next);
			applyUiTypography({ ...previous, editorFontFamily: next });
			try {
				await setUiEditorFontFamily(next);
			} catch (e) {
				restoreTypography(previous);
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[
			editorFontFamily,
			editorFontSize,
			fontFamily,
			monoFontFamily,
			restoreTypography,
			setError,
			uiFontSize,
		],
	);

	const onMonoFontFamilyChange = useCallback(
		async (next: UiFontFamily) => {
			setError("");
			const previous = {
				fontFamily,
				editorFontFamily,
				monoFontFamily,
				uiFontSize,
				editorFontSize,
			};
			setMonoFontFamilyState(next);
			applyUiTypography({ ...previous, monoFontFamily: next });
			try {
				await setUiMonoFontFamily(next);
			} catch (e) {
				restoreTypography(previous);
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[
			editorFontFamily,
			editorFontSize,
			fontFamily,
			monoFontFamily,
			restoreTypography,
			setError,
			uiFontSize,
		],
	);

	const onUiFontSizeChange = useCallback(
		async (next: UiFontSize) => {
			setError("");
			const previous = {
				fontFamily,
				editorFontFamily,
				monoFontFamily,
				uiFontSize,
				editorFontSize,
			};
			setUiFontSizeState(next);
			applyUiTypography({ ...previous, uiFontSize: next });
			try {
				await setUiFontSize(next);
			} catch (e) {
				restoreTypography(previous);
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[
			editorFontFamily,
			editorFontSize,
			fontFamily,
			monoFontFamily,
			restoreTypography,
			setError,
			uiFontSize,
		],
	);

	const onEditorFontSizeChange = useCallback(
		async (next: UiFontSize) => {
			setError("");
			const previous = {
				fontFamily,
				editorFontFamily,
				monoFontFamily,
				uiFontSize,
				editorFontSize,
			};
			setEditorFontSizeState(next);
			applyUiTypography({ ...previous, editorFontSize: next });
			try {
				await setUiEditorFontSize(next);
			} catch (e) {
				restoreTypography(previous);
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[
			editorFontFamily,
			editorFontSize,
			fontFamily,
			monoFontFamily,
			restoreTypography,
			setError,
			uiFontSize,
		],
	);

	return {
		fontFamily,
		editorFontFamily,
		monoFontFamily,
		uiFontSize,
		editorFontSize,
		availableFonts,
		availableMonospaceFonts,
		onFontFamilyChange,
		onEditorFontFamilyChange,
		onMonoFontFamilyChange,
		onUiFontSizeChange,
		onEditorFontSizeChange,
	};
}
