import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
	CUSTOM_THEME_TEMPLATE_JSON,
	type CustomUiThemeId,
	customThemeId,
	parseCustomTheme,
} from "../../../lib/customThemes";
import { DURABLE_SETTINGS, loadSettings } from "../../../lib/settings";
import { SETTINGS_QUERY_KEY } from "../../../lib/settingsStore";
import { invoke } from "../../../lib/tauri";
import {
	GLYPH_DEFAULT_DARK_THEME_ID,
	GLYPH_DEFAULT_LIGHT_THEME_ID,
	isReservedUiThemeName,
} from "../../../lib/uiThemes";

const JSON_FILTERS = [{ name: "JSON", extensions: ["json"] }];

function useInvalidateSettings() {
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
}

/** Drops a custom theme, first moving either mode that used it back to Glyph's default. */
export function useRemoveCustomTheme() {
	const invalidate = useInvalidateSettings();
	return useMutation({
		mutationFn: async (id: CustomUiThemeId) => {
			const { ui } = await loadSettings();
			if (ui.lightThemeId === id) {
				await DURABLE_SETTINGS.lightThemeId.write(GLYPH_DEFAULT_LIGHT_THEME_ID);
			}
			if (ui.darkThemeId === id) {
				await DURABLE_SETTINGS.darkThemeId.write(GLYPH_DEFAULT_DARK_THEME_ID);
			}
			await DURABLE_SETTINGS.customThemes.write(
				ui.customThemes.filter((theme) => customThemeId(theme.name) !== id),
			);
		},
		onSettled: invalidate,
	});
}

/** Picks a JSON file, validates it and appends it; cancelling the picker is a no-op. */
export function useImportCustomTheme() {
	const { t } = useTranslation("settings.appearance");
	const invalidate = useInvalidateSettings();
	return useMutation({
		mutationFn: async () => {
			const { open } = await import("@tauri-apps/plugin-dialog");
			const selection = await open({
				title: t("customThemes.importDialogTitle"),
				multiple: false,
				filters: JSON_FILTERS,
			});
			if (typeof selection !== "string") return;
			const text = await invoke("custom_theme_read", { path: selection });
			const theme = parseCustomTheme(JSON.parse(text));
			const id = customThemeId(theme.name);
			const { ui } = await loadSettings();
			if (
				isReservedUiThemeName(theme.name) ||
				ui.customThemes.some((existing) => customThemeId(existing.name) === id)
			) {
				throw new Error(t("customThemes.nameTaken", { name: theme.name }));
			}
			await DURABLE_SETTINGS.customThemes.write([...ui.customThemes, theme]);
		},
		onSettled: invalidate,
	});
}

export function useCopyThemeTemplate() {
	return useMutation({
		mutationFn: () => navigator.clipboard.writeText(CUSTOM_THEME_TEMPLATE_JSON),
	});
}

export function useSaveThemeTemplate() {
	const { t } = useTranslation("settings.appearance");
	return useMutation({
		mutationFn: async () => {
			const { save } = await import("@tauri-apps/plugin-dialog");
			const selection = await save({
				title: t("customThemes.saveDialogTitle"),
				defaultPath: "glyph-theme.json",
				filters: JSON_FILTERS,
			});
			if (!selection) return;
			await invoke("custom_theme_write", { path: selection, text: CUSTOM_THEME_TEMPLATE_JSON });
		},
	});
}
