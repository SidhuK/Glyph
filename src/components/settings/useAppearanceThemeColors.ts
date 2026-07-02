import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { applyUiAccent, applyUiThemeColors } from "../../lib/appearance";
import {
	type UiAccent,
	isUiAccent,
	loadSettings,
	setUiAccent,
	setUiThemeColorOverride,
} from "../../lib/settings";
import { useTauriEvent } from "../../lib/tauriEvents";
import {
	DEFAULT_UI_THEME_COLOR_OVERRIDES,
	type UiThemeColorField,
	type UiThemeColorMode,
	type UiThemeColorOverrides,
	asThemeColorOverridesPatch,
	mergeThemeColorOverrides,
	tryNormalizeThemeColorHex,
	withThemeColorOverride,
} from "../../lib/themeColors";
import {
	type UiDarkThemeId,
	type UiLightThemeId,
	isGlyphDefaultDarkTheme,
	isGlyphDefaultLightTheme,
} from "../../lib/uiThemes";

interface UseAppearanceThemeColorsOptions {
	setError: Dispatch<SetStateAction<string>>;
	lightThemeId: UiLightThemeId;
	darkThemeId: UiDarkThemeId;
}

export interface AppearanceThemeColorsState {
	accent: UiAccent;
	themeColors: UiThemeColorOverrides;
	showLightColorPickers: boolean;
	showDarkColorPickers: boolean;
	showAccentPicker: boolean;
}

export interface AppearanceThemeColorsActions {
	onAccentChange: (accent: UiAccent) => Promise<void>;
	onAccentReset: () => Promise<void>;
	onThemeColorChange: (
		mode: UiThemeColorMode,
		field: UiThemeColorField,
		color: string | null,
	) => Promise<void>;
}

export function useAppearanceThemeColors({
	setError,
	lightThemeId,
	darkThemeId,
}: UseAppearanceThemeColorsOptions): AppearanceThemeColorsState &
	AppearanceThemeColorsActions {
	const [accent, setAccentState] = useState<UiAccent>("neutral");
	const [themeColors, setThemeColorsState] = useState<UiThemeColorOverrides>(
		DEFAULT_UI_THEME_COLOR_OVERRIDES,
	);
	const appearanceMutationRef = useRef(0);
	const persistedAccentRef = useRef<UiAccent>("neutral");
	const persistedThemeColorsRef = useRef<UiThemeColorOverrides>(
		DEFAULT_UI_THEME_COLOR_OVERRIDES,
	);
	const optimisticThemeColorsRef = useRef<UiThemeColorOverrides>(
		DEFAULT_UI_THEME_COLOR_OVERRIDES,
	);
	const appearanceWriteQueueRef = useRef<Promise<unknown>>(Promise.resolve());

	const applyAccentState = useCallback((next: UiAccent) => {
		setAccentState(next);
		applyUiAccent(next);
	}, []);

	const applyThemeColorsState = useCallback((next: UiThemeColorOverrides) => {
		optimisticThemeColorsRef.current = next;
		setThemeColorsState(next);
		applyUiThemeColors(next);
	}, []);

	const restoreAppearanceState = useCallback(() => {
		applyAccentState(persistedAccentRef.current);
		applyThemeColorsState(persistedThemeColorsRef.current);
	}, [applyAccentState, applyThemeColorsState]);

	useEffect(() => {
		let cancelled = false;
		const hydrationMutationId = appearanceMutationRef.current;
		void (async () => {
			try {
				const settings = await loadSettings();
				if (
					cancelled ||
					appearanceMutationRef.current !== hydrationMutationId
				) {
					return;
				}
				persistedAccentRef.current = settings.ui.accent;
				persistedThemeColorsRef.current = settings.ui.themeColors;
				applyAccentState(settings.ui.accent);
				applyThemeColorsState(settings.ui.themeColors);
			} catch (e) {
				if (!cancelled) {
					setError(e instanceof Error ? e.message : "Failed to load settings");
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [applyAccentState, applyThemeColorsState, setError]);

	useTauriEvent("settings:updated", (payload) => {
		const ui = payload.ui;
		if (!ui) return;

		let nextAccent = persistedAccentRef.current;
		let nextThemeColors = persistedThemeColorsRef.current;
		let changed = false;

		if (isUiAccent(ui.accent)) {
			nextAccent = ui.accent;
			changed = true;
		}

		const themeColorPatch = asThemeColorOverridesPatch(ui.themeColors);
		if (themeColorPatch) {
			nextThemeColors = mergeThemeColorOverrides(
				persistedThemeColorsRef.current,
				themeColorPatch,
			);
			changed = true;
		}

		if (!changed) return;

		appearanceMutationRef.current += 1;
		persistedAccentRef.current = nextAccent;
		persistedThemeColorsRef.current = nextThemeColors;
		applyAccentState(nextAccent);
		applyThemeColorsState(nextThemeColors);
	});

	const persistAppearanceChange = useCallback(
		async (persist: () => Promise<void>) => {
			const mutationId = appearanceMutationRef.current + 1;
			appearanceMutationRef.current = mutationId;
			setError("");
			const task = appearanceWriteQueueRef.current.then(() => persist());
			appearanceWriteQueueRef.current = task.catch(() => {});
			try {
				await task;
			} catch (e) {
				if (appearanceMutationRef.current !== mutationId) return;
				restoreAppearanceState();
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[restoreAppearanceState, setError],
	);

	const onAccentChange = useCallback(
		async (next: UiAccent) => {
			applyAccentState(next);
			await persistAppearanceChange(async () => {
				await setUiAccent(next);
				persistedAccentRef.current = next;
			});
		},
		[applyAccentState, persistAppearanceChange],
	);

	const onAccentReset = useCallback(async () => {
		await onAccentChange("neutral");
	}, [onAccentChange]);

	const onThemeColorChange = useCallback(
		async (
			mode: UiThemeColorMode,
			field: UiThemeColorField,
			color: string | null,
		) => {
			const normalized =
				color === null ? null : tryNormalizeThemeColorHex(color);
			if (color !== null && normalized === null) {
				setError("Invalid theme color");
				return;
			}

			const nextThemeColors = withThemeColorOverride(
				optimisticThemeColorsRef.current,
				mode,
				field,
				normalized,
			);
			applyThemeColorsState(nextThemeColors);
			await persistAppearanceChange(async () => {
				await setUiThemeColorOverride({ mode, field, color: normalized });
				persistedThemeColorsRef.current = nextThemeColors;
			});
		},
		[applyThemeColorsState, persistAppearanceChange, setError],
	);

	const showLightColorPickers = isGlyphDefaultLightTheme(lightThemeId);
	const showDarkColorPickers = isGlyphDefaultDarkTheme(darkThemeId);

	return {
		accent,
		themeColors,
		showLightColorPickers,
		showDarkColorPickers,
		showAccentPicker: showLightColorPickers || showDarkColorPickers,
		onAccentChange,
		onAccentReset,
		onThemeColorChange,
	};
}
