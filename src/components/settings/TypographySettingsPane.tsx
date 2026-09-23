import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import { type AppSettings, loadSettings } from "../../lib/settings";
import { DURABLE_SETTINGS } from "../../lib/settings/definitions";
import { useTauriEvent } from "../../lib/tauriEvents";
import {
	DEFAULT_FONT_FAMILY,
	loadAvailableFonts,
	loadAvailableMonospaceFonts,
} from "./typographyOptions";
import { EditorTypographySection } from "./EditorTypographySection";
import { InterfaceTypographySection } from "./InterfaceTypographySection";
import { applyIfBoolean, useSettingsBoolean } from "./useSettingsBoolean";
import { useSettingsValue } from "./useSettingsValue";

function includeSelectedFonts(fonts: string[], selectedFonts: string[]): string[] {
	const missing = Array.from(new Set(selectedFonts.filter((font) => !fonts.includes(font))));
	return missing.length ? [...missing, ...fonts] : fonts;
}

export function TypographySettingsPane() {
	const settingsQuery = useQuery({
		queryKey: ["typography-settings"],
		queryFn: () => loadSettings(),
		refetchOnWindowFocus: false,
	});
	const fontsQuery = useQuery({
		queryKey: ["typography-fonts"],
		queryFn: () => Promise.all([loadAvailableFonts(), loadAvailableMonospaceFonts()]),
		staleTime: Infinity,
	});

	if (settingsQuery.error) {
		return (
			<div className="settingsPane settingsError">{extractErrorMessage(settingsQuery.error)}</div>
		);
	}
	if (!settingsQuery.data) return null;

	return (
		<TypographySettingsContent
			key={settingsQuery.dataUpdatedAt}
			initialUi={settingsQuery.data.ui}
			fonts={fontsQuery.data?.[0] ?? [DEFAULT_FONT_FAMILY]}
			monospaceFonts={fontsQuery.data?.[1] ?? ["JetBrains Mono"]}
			fontError={fontsQuery.error ? extractErrorMessage(fontsQuery.error) : null}
		/>
	);
}

function TypographySettingsContent({
	initialUi,
	fonts,
	monospaceFonts,
	fontError,
}: {
	initialUi: AppSettings["ui"];
	fonts: string[];
	monospaceFonts: string[];
	fontError: string | null;
}) {
	const [error, setError] = useState("");
	const fontFamily = useSettingsValue(
		initialUi.fontFamily,
		DURABLE_SETTINGS.fontFamily.write,
		setError,
	);
	const monoFontFamily = useSettingsValue(
		initialUi.monoFontFamily,
		DURABLE_SETTINGS.monoFontFamily.write,
		setError,
	);
	const uiFontSize = useSettingsValue(
		initialUi.fontSize,
		DURABLE_SETTINGS.fontSize.write,
		setError,
	);
	const editorFontFamily = useSettingsValue(
		initialUi.editorFontFamily,
		DURABLE_SETTINGS.editorFontFamily.write,
		setError,
	);
	const headingFontEnabled = useSettingsBoolean(
		initialUi.headingFontEnabled,
		DURABLE_SETTINGS.headingFontEnabled.write,
		setError,
	);
	const headingFontFamily = useSettingsValue(
		initialUi.headingFontFamily,
		DURABLE_SETTINGS.headingFontFamily.write,
		setError,
	);
	const editorFontSize = useSettingsValue(
		initialUi.editorFontSize,
		DURABLE_SETTINGS.editorFontSize.write,
		setError,
	);

	useTauriEvent("settings:updated", (payload) => {
		if (typeof payload.ui?.fontFamily === "string") fontFamily.setValue(payload.ui.fontFamily);
		if (typeof payload.ui?.monoFontFamily === "string") {
			monoFontFamily.setValue(payload.ui.monoFontFamily);
		}
		if (typeof payload.ui?.fontSize === "number") uiFontSize.setValue(payload.ui.fontSize);
		if (typeof payload.ui?.editorFontFamily === "string") {
			editorFontFamily.setValue(payload.ui.editorFontFamily);
		}
		if (typeof payload.ui?.headingFontFamily === "string") {
			headingFontFamily.setValue(payload.ui.headingFontFamily);
		}
		applyIfBoolean(payload.ui?.headingFontEnabled, headingFontEnabled.setChecked);
		if (typeof payload.ui?.editorFontSize === "number") {
			editorFontSize.setValue(payload.ui.editorFontSize);
		}
	});

	const availableFonts = includeSelectedFonts(fonts, [
		fontFamily.value,
		editorFontFamily.value,
		headingFontFamily.value,
	]);
	const availableMonospaceFonts = includeSelectedFonts(monospaceFonts, [monoFontFamily.value]);

	return (
		<div className="settingsPane">
			{error || fontError ? <div className="settingsError">{error || fontError}</div> : null}
			<div className="settingsGrid">
				<InterfaceTypographySection
					fontFamily={fontFamily.value}
					monoFontFamily={monoFontFamily.value}
					uiFontSize={uiFontSize.value}
					availableFonts={availableFonts}
					availableMonospaceFonts={availableMonospaceFonts}
					onFontFamilyChange={fontFamily.onChange}
					onMonoFontFamilyChange={monoFontFamily.onChange}
					onUiFontSizeChange={uiFontSize.onChange}
				/>
				<EditorTypographySection
					editorFontFamily={editorFontFamily.value}
					headingFontEnabled={headingFontEnabled.checked}
					headingFontFamily={headingFontFamily.value}
					editorFontSize={editorFontSize.value}
					availableFonts={availableFonts}
					headingFontDisabled={headingFontEnabled.isSaving}
					headingFontFamilyDisabled={headingFontFamily.isSaving}
					onEditorFontFamilyChange={editorFontFamily.onChange}
					onHeadingFontEnabledChange={headingFontEnabled.onCheckedChange}
					onHeadingFontFamilyChange={headingFontFamily.onChange}
					onEditorFontSizeChange={editorFontSize.onChange}
				/>
			</div>
		</div>
	);
}
