import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadSettings } from "../../lib/settings";
import { DEFAULT_FILE_TREE_SORT_MODE, DURABLE_SETTINGS } from "../../lib/settings/definitions";
import type { FileTreeSortMode } from "../../lib/settings/model";
import { useTauriEvent } from "../../lib/tauriEvents";
import { AppearanceAppIconCard } from "./AppearanceAppIconCard";
import { AppearanceCornerRadiusCard } from "./AppearanceCornerRadiusCard";
import { AppearanceCustomThemesCard } from "./AppearanceCustomThemesCard";
import { AppearanceLayoutPreview } from "./AppearancePreviewFrame";
import { AppearanceThemeCard } from "./AppearanceThemeCard";
import { fileTreeSortOptions } from "./FileTreeSettingsSection";
import { SettingsRow, SettingsSection, SettingsToggle } from "./SettingsScaffold";
import { SettingsSegmentedPicker } from "./SettingsSegmentedPicker";
import { SettingsSelect } from "./SettingsSelect";
import { DarkThemeSection, LightThemeSection } from "./themes/ThemeModeSections";
import { useAppearanceCornerRadius } from "./useAppearanceCornerRadius";
import { applyIfBoolean, useSettingsBoolean } from "./useSettingsBoolean";
import { useSettingsValue } from "./useSettingsValue";

export function AppearanceSettingsPane() {
	const { t } = useTranslation("settings.appearance");
	const [error, setError] = useState("");
	const folioMode = useSettingsBoolean(
		DURABLE_SETTINGS.folioMode.defaultValue,
		DURABLE_SETTINGS.folioMode.write,
		setError,
	);
	const folioSortMode = useSettingsValue<FileTreeSortMode>(
		DEFAULT_FILE_TREE_SORT_MODE,
		DURABLE_SETTINGS.folioSortMode.write,
		setError,
	);
	const taskProgressRings = useSettingsBoolean(
		true,
		DURABLE_SETTINGS.showTaskProgressRings.write,
		setError,
	);
	const {
		cornerRadiusStyle,
		setCornerRadiusStyle,
		setInitialCornerRadiusStyle,
		onCornerRadiusStyleChange,
	} = useAppearanceCornerRadius({ setError });

	const setInitialFolioMode = folioMode.setInitialChecked;
	const setInitialTaskProgressRings = taskProgressRings.setInitialChecked;
	const workspaceLayout = folioMode.checked ? "folio" : "default";
	const workspaceLayoutOptions = [
		{
			value: "default",
			label: t("layout.folioMode.options.default.label"),
			description: t("layout.folioMode.options.default.description"),
		},
		{
			value: "folio",
			label: t("layout.folioMode.options.folio.label"),
			description: t("layout.folioMode.options.folio.description"),
		},
	] as const;

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const settings = await loadSettings();
				if (cancelled) return;
				setInitialFolioMode(settings.ui.folioMode);
				folioSortMode.setInitialValue(settings.ui.folioSortMode);
				setInitialTaskProgressRings(settings.ui.showTaskProgressRings);
				setInitialCornerRadiusStyle(settings.ui.cornerRadiusStyle);
			} catch (e) {
				if (!cancelled) {
					setError(e instanceof Error ? e.message : "Failed to load settings");
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [
		setInitialFolioMode,
		setInitialCornerRadiusStyle,
		folioSortMode.setInitialValue,
		setInitialTaskProgressRings,
	]);

	useTauriEvent("settings:updated", (payload) => {
		applyIfBoolean(payload.ui?.folioMode, folioMode.setChecked);
		applyIfBoolean(payload.ui?.showTaskProgressRings, taskProgressRings.setChecked);
		if (payload.ui?.folioSortMode && !folioSortMode.isSaving) {
			folioSortMode.setValue(payload.ui.folioSortMode);
		}
		if (payload.ui?.cornerRadiusStyle) {
			setCornerRadiusStyle(payload.ui.cornerRadiusStyle);
		}
	});

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}
			<div className="settingsGrid">
				<AppearanceAppIconCard />
				<AppearanceThemeCard />
				<LightThemeSection />
				<DarkThemeSection />
				<AppearanceCustomThemesCard />
				<AppearanceCornerRadiusCard
					cornerRadiusStyle={cornerRadiusStyle}
					onCornerRadiusStyleChange={onCornerRadiusStyleChange}
				/>
				<SettingsSection title={t("layout.sectionTitle")}>
					<SettingsRow
						label={t("layout.folioMode.label")}
						description={t("layout.folioMode.description")}
						interactive={false}
						searchId="appearance-layout-folio-mode"
					>
						<SettingsSegmentedPicker
							ariaLabel={t("layout.folioMode.ariaLabel")}
							value={workspaceLayout}
							options={workspaceLayoutOptions}
							disabled={folioMode.isSaving}
							onChange={(layout) => folioMode.onCheckedChange(layout === "folio")}
							renderPreview={(layout) => <AppearanceLayoutPreview layout={layout} />}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("layout.folioSort.label")}
						description={t("layout.folioSort.description")}
						interactive={false}
						searchId="appearance-layout-folio-sort"
					>
						<SettingsSelect
							aria-label={t("layout.folioSort.ariaLabel")}
							value={folioSortMode.value}
							disabled={folioSortMode.isSaving}
							options={fileTreeSortOptions()}
							onValueChange={folioSortMode.onChange}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("layout.taskProgressRings.label")}
						description={t("layout.taskProgressRings.description")}
						searchId="appearance-layout-task-progress-rings"
					>
						<SettingsToggle
							checked={taskProgressRings.checked}
							disabled={taskProgressRings.isSaving}
							ariaLabel={t("layout.taskProgressRings.ariaLabel")}
							onCheckedChange={taskProgressRings.onCheckedChange}
						/>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
