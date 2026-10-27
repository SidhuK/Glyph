import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DURABLE_SETTINGS, loadSettings } from "../../lib/settings";
import { useTauriEvent } from "../../lib/tauriEvents";
import { Button } from "../ui/shadcn/button";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";

const ICONS = ["default", "blue-star", "blue-glyph", "confetti-star", "blueprint"] as const;
const QUERY_KEY = ["appearance-app-icon"] as const;

export function AppearanceAppIconCard() {
	const { t } = useTranslation("settings.appearance");
	const queryClient = useQueryClient();
	const query = useQuery({
		queryKey: QUERY_KEY,
		queryFn: async () => (await loadSettings()).ui.appIcon,
	});
	const mutation = useMutation({
		mutationFn: DURABLE_SETTINGS.appIcon.write,
		onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
	});
	useTauriEvent("settings:updated", (payload) => {
		if (payload.ui?.appIcon) {
			queryClient.setQueryData(QUERY_KEY, payload.ui.appIcon);
		}
	});

	return (
		<SettingsSection title={t("appIcon.sectionTitle")}>
			<SettingsRow
				label={t("appIcon.title")}
				description={t("appIcon.description")}
				searchId="appearance-app-icon"
				interactive={false}
			>
				{query.isError ? (
					<div className="settingsError" role="alert">
						{t("appIcon.loadError")}
					</div>
				) : query.data ? (
					<fieldset
						disabled={mutation.isPending}
						className="appIconPicker m-0 flex min-w-0 flex-nowrap justify-end gap-2 border-0 p-0"
						aria-label={t("appIcon.title")}
					>
						{ICONS.map((icon) => (
							<label
								key={icon}
								className="relative block cursor-pointer"
								title={t(`appIcon.${icon}`)}
							>
								<input
									type="radio"
									name="settings-app-icon"
									value={icon}
									checked={query.data === icon}
									onChange={() => mutation.mutate(icon)}
									aria-label={t(`appIcon.${icon}`)}
									className="peer sr-only"
								/>
								<span className="appIconPickerTile flex size-9 items-center justify-center rounded-lg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--text-primary)] peer-disabled:cursor-wait peer-disabled:opacity-50">
									<img
										src={icon === "default" ? "/glyph-app-icon.png" : `/app-icons/${icon}.png`}
										alt=""
										width={32}
										height={32}
										className="size-8 object-contain"
									/>
								</span>
							</label>
						))}
					</fieldset>
				) : (
					<output>{t("appIcon.loading")}</output>
				)}
				{mutation.isError && (
					<div className="settingsError" role="alert">
						{t("appIcon.saveError")}
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								if (mutation.variables) mutation.mutate(mutation.variables);
							}}
						>
							{t("appIcon.retry")}
						</Button>
					</div>
				)}
			</SettingsRow>
		</SettingsSection>
	);
}
