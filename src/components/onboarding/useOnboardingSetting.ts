import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { loadSettings } from "../../lib/settings";
import type { ApplicationSettingDefinition } from "../../lib/settings/definitions";
import { SETTINGS_QUERY_KEY } from "../../lib/settingsStore";

/** Reads one setting from the shared settings query and writes changes live. */
export function useOnboardingSetting<Value>(definition: ApplicationSettingDefinition<Value>) {
	const queryClient = useQueryClient();
	const settings = useQuery({ queryKey: SETTINGS_QUERY_KEY, queryFn: () => loadSettings() });
	const mutation = useMutation({
		mutationFn: definition.write,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
	});
	const stored = settings.data ? definition.read(settings.data) : definition.defaultValue;
	const value =
		mutation.isPending && mutation.variables !== undefined ? mutation.variables : stored;
	return { value, onChange: (next: Value) => mutation.mutate(next), error: mutation.error };
}
