import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { loadSettings } from "../../../lib/settings";
import { SETTINGS_QUERY_KEY } from "../../../lib/settingsStore";

/** Shared settings snapshot; `settings:updated` invalidates it, so every section stays in sync. */
export function useAppearanceSettingsQuery() {
	return useQuery({
		queryKey: SETTINGS_QUERY_KEY,
		queryFn: () => loadSettings(),
	});
}

/** Persists one setting. While pending, `variables` is the optimistic value to render. */
export function useSettingWrite<T>(write: (value: T) => Promise<void>) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: write,
		onSettled: () => queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
	});
}

/** Shows the value being saved until the write settles, then the persisted one. */
export function pendingOr<T>(
	mutation: { isPending: boolean; variables: T | undefined },
	persisted: T | undefined,
): T | undefined {
	return mutation.isPending && mutation.variables !== undefined ? mutation.variables : persisted;
}
