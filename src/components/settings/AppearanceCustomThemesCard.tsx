import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	CUSTOM_THEME_TEMPLATE_JSON,
	type CustomTheme,
	customThemeId,
	parseCustomTheme,
} from "../../lib/customThemes";
import { extractErrorMessage } from "../../lib/errorUtils";
import { invoke } from "../../lib/tauri";
import { isReservedUiThemeName } from "../../lib/uiThemes";
import { Trash2 } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { SettingsInfoHint, SettingsRow, SettingsSection } from "./SettingsScaffold";

interface AppearanceCustomThemesCardProps {
	customThemes: readonly CustomTheme[];
	onImport: (theme: CustomTheme) => Promise<void>;
	onRemove: (theme: CustomTheme) => Promise<void>;
}

export function AppearanceCustomThemesCard({
	customThemes,
	onImport,
	onRemove,
}: AppearanceCustomThemesCardProps) {
	const { t } = useTranslation("settings.appearance");
	const [error, setError] = useState("");

	const handleCopyTemplate = useCallback(async () => {
		setError("");
		try {
			await navigator.clipboard.writeText(CUSTOM_THEME_TEMPLATE_JSON);
		} catch (cause) {
			setError(extractErrorMessage(cause));
		}
	}, []);

	const handleSaveTemplate = useCallback(async () => {
		setError("");
		try {
			const { save } = await import("@tauri-apps/plugin-dialog");
			const selection = await save({
				title: t("customThemes.saveDialogTitle"),
				defaultPath: "glyph-theme.json",
				filters: [{ name: "JSON", extensions: ["json"] }],
			});
			if (!selection) return;
			await invoke("custom_theme_write", {
				path: selection,
				text: CUSTOM_THEME_TEMPLATE_JSON,
			});
		} catch (cause) {
			setError(extractErrorMessage(cause));
		}
	}, [t]);

	const handleImport = useCallback(async () => {
		setError("");
		try {
			const { open } = await import("@tauri-apps/plugin-dialog");
			const selection = await open({
				title: t("customThemes.importDialogTitle"),
				multiple: false,
				filters: [{ name: "JSON", extensions: ["json"] }],
			});
			if (typeof selection !== "string") return;
			const text = await invoke("custom_theme_read", { path: selection });
			const theme = parseCustomTheme(JSON.parse(text));
			const id = customThemeId(theme.name);
			if (
				isReservedUiThemeName(theme.name) ||
				customThemes.some((existing) => customThemeId(existing.name) === id)
			) {
				setError(t("customThemes.nameTaken", { name: theme.name }));
				return;
			}
			await onImport(theme);
		} catch (cause) {
			setError(extractErrorMessage(cause));
		}
	}, [customThemes, onImport, t]);

	const handleRemove = useCallback(
		async (theme: CustomTheme) => {
			setError("");
			try {
				await onRemove(theme);
			} catch (cause) {
				setError(extractErrorMessage(cause));
			}
		},
		[onRemove],
	);

	return (
		<SettingsSection
			title={t("customThemes.sectionTitle")}
			description={t("customThemes.sectionDescription")}
		>
			<SettingsRow
				label={t("customThemes.template.label")}
				description={t("customThemes.template.description")}
				interactive={false}
			>
				<div className="settingsActions">
					<Button type="button" variant="outline" onClick={() => void handleCopyTemplate()}>
						{t("customThemes.template.copy")}
					</Button>
					<Button type="button" variant="outline" onClick={() => void handleSaveTemplate()}>
						{t("customThemes.template.save")}
					</Button>
				</div>
			</SettingsRow>

			<SettingsRow
				title={t("customThemes.import.label")}
				label={
					<span className="settingsLabelWithHelp">
						{t("customThemes.import.label")}
						<SettingsInfoHint ariaLabel={t("customThemes.import.helpAriaLabel")}>
							{t("customThemes.import.description")}
						</SettingsInfoHint>
					</span>
				}
				interactive={false}
			>
				<Button type="button" variant="outline" onClick={() => void handleImport()}>
					{t("customThemes.import.action")}
				</Button>
			</SettingsRow>

			{customThemes.map((theme) => (
				<SettingsRow
					key={customThemeId(theme.name)}
					label={theme.name}
					description={t("customThemes.installedDescription")}
					interactive={false}
				>
					<Button
						type="button"
						variant="destructive"
						size="icon-sm"
						aria-label={t("customThemes.removeAriaLabel", { name: theme.name })}
						title={t("customThemes.removeAriaLabel", { name: theme.name })}
						onClick={() => void handleRemove(theme)}
					>
						<Trash2 size="var(--icon-md)" />
					</Button>
				</SettingsRow>
			))}

			{error ? <div className="settingsError">{error}</div> : null}
		</SettingsSection>
	);
}
