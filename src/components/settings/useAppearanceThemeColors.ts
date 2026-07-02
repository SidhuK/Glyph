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

const THEME_COLOR_SAVE_DEBOUNCE_MS = 250;

interface PendingThemeColorSave {
	mode: UiThemeColorMode;
	field: UiThemeColorField;
	color: string | null;
}

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

interface AppearanceThemeColorsLoadActions {
	onAppearanceSettingsLoaded: (
		accent: UiAccent,
		themeColors: UiThemeColorOverrides,
	) => void;
}

export function useAppearanceThemeColors({
	setError,
	lightThemeId,
	darkThemeId,
}: UseAppearanceThemeColorsOptions): AppearanceThemeColorsState &
	AppearanceThemeColorsActions &
	AppearanceThemeColorsLoadActions {
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
	const pendingThemeColorSavesRef = useRef<PendingThemeColorSave[]>([]);
	const themeColorSaveTimerRef = useRef<number | null>(null);

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

	const onAppearanceSettingsLoaded = useCallback(
		(nextAccent: UiAccent, nextThemeColors: UiThemeColorOverrides) => {
			if (appearanceMutationRef.current !== 0) return;
			persistedAccentRef.current = nextAccent;
			persistedThemeColorsRef.current = nextThemeColors;
			applyAccentState(nextAccent);
			applyThemeColorsState(nextThemeColors);
		},
		[applyAccentState, applyThemeColorsState],
	);

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

	const persistThemeColorChange = useCallback(
		async (
			mode: UiThemeColorMode,
			field: UiThemeColorField,
			color: string | null,
		) => {
			await persistAppearanceChange(async () => {
				await setUiThemeColorOverride({ mode, field, color });
				persistedThemeColorsRef.current = withThemeColorOverride(
					persistedThemeColorsRef.current,
					mode,
					field,
					color,
				);
			});
		},
		[persistAppearanceChange],
	);

	const flushPendingThemeColorSaves = useCallback(() => {
		if (themeColorSaveTimerRef.current !== null) {
			window.clearTimeout(themeColorSaveTimerRef.current);
			themeColorSaveTimerRef.current = null;
		}
		const pendingSaves = pendingThemeColorSavesRef.current;
		pendingThemeColorSavesRef.current = [];
		for (const pending of pendingSaves) {
			void persistThemeColorChange(pending.mode, pending.field, pending.color);
		}
	}, [persistThemeColorChange]);

	const queueThemeColorSave = useCallback(
		(pending: PendingThemeColorSave) => {
			pendingThemeColorSavesRef.current = [
				...pendingThemeColorSavesRef.current.filter(
					(save) => save.mode !== pending.mode || save.field !== pending.field,
				),
				pending,
			];
			if (themeColorSaveTimerRef.current !== null) {
				window.clearTimeout(themeColorSaveTimerRef.current);
			}
			themeColorSaveTimerRef.current = window.setTimeout(
				flushPendingThemeColorSaves,
				THEME_COLOR_SAVE_DEBOUNCE_MS,
			);
		},
		[flushPendingThemeColorSaves],
	);

	const clearQueuedThemeColorSave = useCallback(
		(mode: UiThemeColorMode, field: UiThemeColorField) => {
			pendingThemeColorSavesRef.current =
				pendingThemeColorSavesRef.current.filter(
					(save) => save.mode !== mode || save.field !== field,
				);
			if (
				pendingThemeColorSavesRef.current.length === 0 &&
				themeColorSaveTimerRef.current !== null
			) {
				window.clearTimeout(themeColorSaveTimerRef.current);
				themeColorSaveTimerRef.current = null;
			}
		},
		[],
	);

	useEffect(() => {
		return () => {
			flushPendingThemeColorSaves();
		};
	}, [flushPendingThemeColorSaves]);

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
			if (normalized === null) {
				clearQueuedThemeColorSave(mode, field);
				await persistThemeColorChange(mode, field, normalized);
				return;
			}
			queueThemeColorSave({ mode, field, color: normalized });
		},
		[
			applyThemeColorsState,
			clearQueuedThemeColorSave,
			persistThemeColorChange,
			queueThemeColorSave,
			setError,
		],
	);

	const showLightColorPickers = isGlyphDefaultLightTheme(lightThemeId);
	const showDarkColorPickers = isGlyphDefaultDarkTheme(darkThemeId);

	return {
		accent,
		themeColors,
		showLightColorPickers,
		showDarkColorPickers,
		showAccentPicker: showLightColorPickers || showDarkColorPickers,
		onAppearanceSettingsLoaded,
		onAccentChange,
		onAccentReset,
		onThemeColorChange,
	};
}
