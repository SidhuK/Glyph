import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../lib/errorUtils";
import { loadSettings } from "../../lib/settings";
import { useTauriEvent } from "../../lib/tauriEvents";
import { toast } from "../../lib/toast";
import type { PaletteSettingDefinition } from "./settingsPaletteRegistry";

interface SettingMutation {
	definition: PaletteSettingDefinition;
	value: string | number | boolean | null;
}

const SETTINGS_QUERY_ROOT = "command-palette-settings";

export function usePaletteSettings(open: boolean, spacePath: string | null) {
	const { t } = useTranslation("shell");
	const queryClient = useQueryClient();
	const queryKey = [SETTINGS_QUERY_ROOT, spacePath] as const;
	const query = useQuery({
		queryKey,
		queryFn: () => loadSettings({ spacePath }),
		enabled: open,
	});
	useTauriEvent("settings:updated", () => {
		void queryClient.invalidateQueries({ queryKey: [SETTINGS_QUERY_ROOT] });
	});
	const mutation = useMutation({
		mutationFn: async ({ definition, value }: SettingMutation) => {
			if (definition.scope === "space" && !spacePath) {
				throw new Error(t("commandPalette.spaceRequired"));
			}
			await definition.write(value, spacePath);
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey }),
		onError: (cause) => {
			const message = extractErrorMessage(cause);
			toast.error(t("commandPalette.settingUpdateFailed"), {
				description: message,
			});
		},
	});
	const valueFor = useCallback(
		(definition: PaletteSettingDefinition) => {
			if (
				mutation.isPending &&
				mutation.variables.definition.id === definition.id
			) {
				return mutation.variables.value;
			}
			return query.data ? definition.read(query.data) : null;
		},
		[mutation.isPending, mutation.variables, query.data],
	);

	return {
		settings: query.data,
		valueFor,
		update: mutation.mutate,
		pending: mutation.isPending,
		error: mutation.isError ? extractErrorMessage(mutation.error) : null,
		announcement: mutation.isSuccess ? t("commandPalette.settingUpdated") : "",
	};
}
