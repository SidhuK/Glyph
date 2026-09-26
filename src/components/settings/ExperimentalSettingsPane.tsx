import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../lib/errorUtils";
import { type FocusMode, isFocusMode, loadSettings } from "../../lib/settings";
import { DURABLE_SETTINGS } from "../../lib/settings/definitions";
import { invalidateSettingsCache } from "../../lib/settingsStore";
import { useTauriEvent } from "../../lib/tauriEvents";
import { SettingsInfoHint, SettingsRow, SettingsSection, SettingsToggle } from "./SettingsScaffold";
import { SettingsSelect } from "./SettingsSelect";

const SETTINGS_QUERY_ROOT = "experimental-settings";

const FOCUS_MODE_VALUES = ["off", "paragraph", "sentence"] as const satisfies readonly FocusMode[];

function VimModeInfo() {
	const { t } = useTranslation("settings.general");
	return (
		<SettingsInfoHint ariaLabel={t("editor.vimMode.helpAriaLabel")}>
			{t("editor.vimMode.info")}
		</SettingsInfoHint>
	);
}

export function ExperimentalSettingsPane() {
	const { t } = useTranslation("settings.general");
	const queryClient = useQueryClient();
	const settingsQuery = useQuery({
		queryKey: [SETTINGS_QUERY_ROOT],
		queryFn: () => loadSettings(),
	});
	const saveSetting = useMutation({
		mutationFn: (write: () => Promise<void>) => write(),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: [SETTINGS_QUERY_ROOT] }),
	});
	const settings = settingsQuery.data;
	const disabled = !settings || saveSetting.isPending;

	useTauriEvent("settings:updated", () => {
		invalidateSettingsCache();
		void queryClient.invalidateQueries({ queryKey: [SETTINGS_QUERY_ROOT] });
	});

	const error = settingsQuery.error ?? saveSetting.error;
	const displayedError = error ? extractErrorMessage(error) : "";

	return (
		<div className="settingsPane">
			{displayedError ? <div className="settingsError">{displayedError}</div> : null}
			<div className="settingsGrid">
				<SettingsSection
					title={t("experimental.sectionTitle")}
					description={t("experimental.sectionDescription")}
				>
					<SettingsRow
						label={t("experimental.noteSidePeek.label")}
						description={t("experimental.noteSidePeek.description")}
						searchId="appearance-layout-note-side-peek"
					>
						<SettingsToggle
							checked={settings?.ui.noteSidePeek ?? DURABLE_SETTINGS.noteSidePeek.defaultValue}
							disabled={disabled}
							ariaLabel={t("experimental.noteSidePeek.ariaLabel")}
							onCheckedChange={(checked) =>
								saveSetting.mutate(() => DURABLE_SETTINGS.noteSidePeek.write(checked))
							}
						/>
					</SettingsRow>
					<SettingsRow
						title={t("editor.vimMode.title")}
						label={
							<span className="settingsLabelWithHelp">
								{t("editor.vimMode.label")}
								<VimModeInfo />
							</span>
						}
						description={t("editor.vimMode.description")}
						interactive={false}
					>
						<SettingsToggle
							checked={
								settings?.editor.rawMarkdownVimMode ??
								DURABLE_SETTINGS.editorRawMarkdownVimMode.defaultValue
							}
							disabled={disabled}
							ariaLabel={t("editor.vimMode.ariaLabel")}
							onCheckedChange={(checked) =>
								saveSetting.mutate(() => DURABLE_SETTINGS.editorRawMarkdownVimMode.write(checked))
							}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("editor.rawLivePreview.label")}
						description={t("editor.rawLivePreview.description")}
						searchId="general-editor-raw-live-preview"
					>
						<SettingsToggle
							checked={
								settings?.editor.rawMarkdownLivePreview ??
								DURABLE_SETTINGS.editorRawMarkdownLivePreview.defaultValue
							}
							disabled={disabled}
							ariaLabel={t("editor.rawLivePreview.label")}
							onCheckedChange={(checked) =>
								saveSetting.mutate(() =>
									DURABLE_SETTINGS.editorRawMarkdownLivePreview.write(checked),
								)
							}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("experimental.zenMode.label")}
						description={t("experimental.zenMode.description")}
						searchId="general-editor-zen-mode"
					>
						<SettingsToggle
							checked={settings?.editor.zenMode ?? DURABLE_SETTINGS.editorZenMode.defaultValue}
							disabled={disabled}
							ariaLabel={t("experimental.zenMode.ariaLabel")}
							onCheckedChange={(checked) =>
								saveSetting.mutate(() => DURABLE_SETTINGS.editorZenMode.write(checked))
							}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("editor.formatBar.label")}
						description={t("editor.formatBar.description")}
						searchId="general-editor-format-bar"
					>
						<SettingsToggle
							checked={
								settings?.editor.showFormatBar ?? DURABLE_SETTINGS.editorShowFormatBar.defaultValue
							}
							disabled={disabled}
							ariaLabel={t("editor.formatBar.ariaLabel")}
							onCheckedChange={(checked) =>
								saveSetting.mutate(() => DURABLE_SETTINGS.editorShowFormatBar.write(checked))
							}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("editor.focusMode.label")}
						description={t("editor.focusMode.description")}
						interactive={false}
						searchId="general-editor-focus-mode"
					>
						<SettingsSelect
							aria-label={t("editor.focusMode.ariaLabel")}
							value={settings?.editor.focusMode ?? DURABLE_SETTINGS.editorFocusMode.defaultValue}
							disabled={disabled}
							onChange={(event) => {
								const nextMode = event.currentTarget.value;
								if (!isFocusMode(nextMode)) return;
								saveSetting.mutate(() => DURABLE_SETTINGS.editorFocusMode.write(nextMode));
							}}
						>
							{FOCUS_MODE_VALUES.map((value) => (
								<option key={value} value={value}>
									{t(`editor.focusMode.options.${value}`)}
								</option>
							))}
						</SettingsSelect>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
