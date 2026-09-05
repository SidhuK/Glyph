import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";
import { useTranslation } from "react-i18next";
import { DURABLE_SETTINGS, loadSettings } from "../../lib/settings";
import { useTauriEvent } from "../../lib/tauriEvents";
import { Button } from "../ui/shadcn/button";
import { SettingsRow } from "./SettingsScaffold";

const ICONS = ["default", "blue-star", "blue-glyph", "confetti-star"] as const;
const QUERY_KEY = ["appearance-app-icon"] as const;

export function AppearanceAppIconCard() {
	const { t } = useTranslation("settings.appearance");
	const queryClient = useQueryClient();
	const query = useQuery({
		queryKey: QUERY_KEY,
		queryFn: async () => (await loadSettings()).ui.appIcon,
	});
	const version = useQuery({
		queryKey: ["app-version"],
		queryFn: getVersion,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const badge = import.meta.env.DEV
		? "dev"
		: version.data?.split("-")[1]?.split("+")[0]?.split(".").includes("alpha")
			? "alpha"
			: null;
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
		<div className="settingsCard">
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
						className="m-0 flex min-w-0 flex-wrap justify-end gap-2 border-0 p-0"
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
								<span className="relative flex size-12 items-center justify-center rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] transition-colors peer-checked:border-[var(--text-primary)] peer-checked:ring-1 peer-checked:ring-[var(--text-primary)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-[var(--text-primary)] peer-disabled:cursor-wait peer-disabled:opacity-50">
									<img
										src={
											icon === "default"
												? "/glyph-app-icon.png"
												: `/app-icons/${icon}.png`
										}
										alt=""
										width={40}
										height={40}
										className="size-10 object-contain"
									/>
									{icon === "default" && badge && (
										<span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1 py-0.5 text-[8px] leading-none font-semibold text-white">
											{t(`menu:app.${badge}Badge`)}
										</span>
									)}
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
		</div>
	);
}
