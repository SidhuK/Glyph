import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUILayoutContext } from "../../contexts";
import { loadSettings } from "../../lib/settings";
import { DURABLE_SETTINGS } from "../../lib/settings/definitions";
import { SETTINGS_QUERY_KEY } from "../../lib/settingsStore";
import type { SettingsTab } from "./settingsConfig";

export function useDeveloperMode() {
	const queryClient = useQueryClient();
	const settingsQuery = useQuery({
		queryKey: SETTINGS_QUERY_KEY,
		queryFn: () => loadSettings(),
	});
	const save = useMutation({
		mutationFn: (enabled: boolean) => DURABLE_SETTINGS.developerMode.write(enabled),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
	});
	return {
		enabled: settingsQuery.data?.ui.developerMode ?? DURABLE_SETTINGS.developerMode.defaultValue,
		loaded: settingsQuery.data !== undefined,
		save,
	};
}

/** The selected settings tab, falling back to About when the Developer tab is hidden. */
export function useActiveSettingsTab(): SettingsTab {
	const { settingsTab } = useUILayoutContext();
	const { enabled } = useDeveloperMode();
	return settingsTab === "developer" && !enabled ? "about" : settingsTab;
}
