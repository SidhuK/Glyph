import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useRef,
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
import { useTauriEvent } from "../../lib/tauriEvents";
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

function getTypographyFromSettings(
	settings: Awaited<ReturnType<typeof loadSettings>>,
) {
	return {
		fontFamily: settings.ui.fontFamily,
		editorFontFamily: settings.ui.editorFontFamily,
		monoFontFamily: settings.ui.monoFontFamily,
		uiFontSize: settings.ui.fontSize,
		editorFontSize: settings.ui.editorFontSize,
	};
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
	const typographyMutationRef = useRef(0);
	const typographyRef = useRef<UiTypographyPreferences>({
		fontFamily: DEFAULT_FONT_FAMILY,
		editorFontFamily: DEFAULT_FONT_FAMILY,
		monoFontFamily: "JetBrains Mono",
		uiFontSize: 14,
		editorFontSize: 16,
	});

	const applyTypographyState = useCallback((next: UiTypographyPreferences) => {
		typographyRef.current = next;
		applyAndSetTypography(
			next,
			setFontFamilyState,
			setEditorFontFamilyState,
			setMonoFontFamilyState,
			setUiFontSizeState,
			setEditorFontSizeState,
		);
	}, []);

	useEffect(() => {
		let cancelled = false;
		const hydrationMutationId = typographyMutationRef.current;
		void (async () => {
			try {
				const [settings, fonts, monoFonts] = await Promise.all([
					loadSettings(),
					loadAvailableFonts(),
					loadAvailableMonospaceFonts(),
				]);
				if (cancelled) return;
				const typography = getTypographyFromSettings(settings);
				const canApplyHydratedTypography =
					typographyMutationRef.current === hydrationMutationId;
				const currentTypography = canApplyHydratedTypography
					? typography
					: typographyRef.current;
				if (canApplyHydratedTypography) {
					applyTypographyState(typography);
				}
				setAvailableFonts(
					includeSelectedFonts(fonts, [
						currentTypography.fontFamily,
						currentTypography.editorFontFamily,
					]),
				);
				setAvailableMonospaceFonts(
					monoFonts.includes(currentTypography.monoFontFamily)
						? monoFonts
						: [currentTypography.monoFontFamily, ...monoFonts],
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
	}, [applyTypographyState, setError]);

	useTauriEvent("settings:updated", (payload) => {
		const ui = payload.ui;
		if (!ui) return;
		const previous = typographyRef.current;
		const next = {
			fontFamily:
				typeof ui.fontFamily === "string" ? ui.fontFamily : previous.fontFamily,
			editorFontFamily:
				typeof ui.editorFontFamily === "string"
					? ui.editorFontFamily
					: previous.editorFontFamily,
			monoFontFamily:
				typeof ui.monoFontFamily === "string"
					? ui.monoFontFamily
					: previous.monoFontFamily,
			uiFontSize:
				typeof ui.fontSize === "number" && Number.isFinite(ui.fontSize)
					? ui.fontSize
					: previous.uiFontSize,
			editorFontSize:
				typeof ui.editorFontSize === "number" &&
				Number.isFinite(ui.editorFontSize)
					? ui.editorFontSize
					: previous.editorFontSize,
		};
		if (
			next.fontFamily === previous.fontFamily &&
			next.editorFontFamily === previous.editorFontFamily &&
			next.monoFontFamily === previous.monoFontFamily &&
			next.uiFontSize === previous.uiFontSize &&
			next.editorFontSize === previous.editorFontSize
		) {
			return;
		}
		typographyMutationRef.current += 1;
		applyTypographyState(next);
		setAvailableFonts((fonts) =>
			includeSelectedFonts(fonts, [next.fontFamily, next.editorFontFamily]),
		);
		setAvailableMonospaceFonts((fonts) =>
			fonts.includes(next.monoFontFamily)
				? fonts
				: [next.monoFontFamily, ...fonts],
		);
	});

	const restoreTypography = useCallback(
		(previous: UiTypographyPreferences) => {
			applyTypographyState(previous);
		},
		[applyTypographyState],
	);

	const persistTypographyChange = useCallback(
		async (
			previous: UiTypographyPreferences,
			next: UiTypographyPreferences,
			persist: () => Promise<void>,
		) => {
			const mutationId = typographyMutationRef.current + 1;
			typographyMutationRef.current = mutationId;
			setError("");
			applyTypographyState(next);
			try {
				await persist();
			} catch (e) {
				if (typographyMutationRef.current !== mutationId) return;
				restoreTypography(previous);
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[applyTypographyState, restoreTypography, setError],
	);

	const onFontFamilyChange = useCallback(
		async (next: UiFontFamily) => {
			const previous = typographyRef.current;
			await persistTypographyChange(
				previous,
				{ ...previous, fontFamily: next },
				() => setUiFontFamily(next),
			);
		},
		[persistTypographyChange],
	);

	const onEditorFontFamilyChange = useCallback(
		async (next: UiFontFamily) => {
			const previous = typographyRef.current;
			await persistTypographyChange(
				previous,
				{ ...previous, editorFontFamily: next },
				() => setUiEditorFontFamily(next),
			);
		},
		[persistTypographyChange],
	);

	const onMonoFontFamilyChange = useCallback(
		async (next: UiFontFamily) => {
			const previous = typographyRef.current;
			await persistTypographyChange(
				previous,
				{ ...previous, monoFontFamily: next },
				() => setUiMonoFontFamily(next),
			);
		},
		[persistTypographyChange],
	);

	const onUiFontSizeChange = useCallback(
		async (next: UiFontSize) => {
			const previous = typographyRef.current;
			await persistTypographyChange(
				previous,
				{ ...previous, uiFontSize: next },
				() => setUiFontSize(next),
			);
		},
		[persistTypographyChange],
	);

	const onEditorFontSizeChange = useCallback(
		async (next: UiFontSize) => {
			const previous = typographyRef.current;
			await persistTypographyChange(
				previous,
				{ ...previous, editorFontSize: next },
				() => setUiEditorFontSize(next),
			);
		},
		[persistTypographyChange],
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
