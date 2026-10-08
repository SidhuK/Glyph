import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../lib/errorUtils";
import { loadSettings } from "../../lib/settings";
import { DURABLE_SETTINGS } from "../../lib/settings/definitions";
import { SETTINGS_QUERY_KEY } from "../../lib/settingsStore";
import { invoke } from "../../lib/tauri";
import { toast } from "../../lib/toast";
import { Button } from "../ui/shadcn/button";
import { SettingsRow, SettingsSection, SettingsToggle } from "./SettingsScaffold";

export function DiagnosticsSection() {
	const { t } = useTranslation("settings.general");
	const queryClient = useQueryClient();
	const settingsQuery = useQuery({
		queryKey: SETTINGS_QUERY_KEY,
		queryFn: () => loadSettings(),
	});
	const saveLogging = useMutation({
		mutationFn: (enabled: boolean) => DURABLE_SETTINGS.diagnosticLogging.write(enabled),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
	});
	const exportLogs = useMutation({
		mutationFn: () =>
			invoke("diagnostics_export_logs", {
				dialog_title: t("developer.diagnostics.export.dialogTitle"),
			}),
	});
	const clearLogs = useMutation({
		mutationFn: () => invoke("diagnostics_clear_logs"),
		onSuccess: () => toast.success(t("developer.diagnostics.clear.done")),
	});

	const error = settingsQuery.error ?? saveLogging.error ?? exportLogs.error ?? clearLogs.error;
	const enabled =
		settingsQuery.data?.ui.diagnosticLogging ?? DURABLE_SETTINGS.diagnosticLogging.defaultValue;

	return (
		<SettingsSection
			title={t("developer.diagnostics.title")}
			description={t("developer.diagnostics.description")}
		>
			{error ? <div className="settingsError">{extractErrorMessage(error)}</div> : null}
			<SettingsRow
				label={t("developer.diagnostics.logging.label")}
				description={t("developer.diagnostics.logging.description")}
				searchId="developer-diagnostic-logging"
			>
				<SettingsToggle
					checked={enabled}
					disabled={!settingsQuery.data || saveLogging.isPending}
					ariaLabel={t("developer.diagnostics.logging.ariaLabel")}
					onCheckedChange={(checked) => saveLogging.mutate(checked)}
				/>
			</SettingsRow>
			<SettingsRow
				label={t("developer.diagnostics.export.label")}
				description={t("developer.diagnostics.export.description")}
				interactive={false}
			>
				<div className="settingsActions">
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={exportLogs.isPending}
						onClick={() => exportLogs.mutate()}
					>
						{exportLogs.isPending
							? t("developer.diagnostics.export.exporting")
							: t("developer.diagnostics.export.action")}
					</Button>
				</div>
			</SettingsRow>
			<SettingsRow
				label={t("developer.diagnostics.clear.label")}
				description={t("developer.diagnostics.clear.description")}
				interactive={false}
			>
				<div className="settingsActions">
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={clearLogs.isPending}
						onClick={() => clearLogs.mutate()}
					>
						{t("developer.diagnostics.clear.action")}
					</Button>
				</div>
			</SettingsRow>
		</SettingsSection>
	);
}
