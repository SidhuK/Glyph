import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
	type ConnectionsGraphOptions,
	DEFAULT_CONNECTIONS_GRAPH_OPTIONS,
	connectionsLinkCurvature,
	connectionsLinkOpacity,
	connectionsLinkThicknessScale,
	connectionsNodeSizeScale,
} from "../../lib/connectionsGraphOptions";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	type AppSettings,
	SPACE_SETTINGS,
	loadSettings,
	writeSpaceSetting,
} from "../../lib/settings";
import { useTauriEvent } from "../../lib/tauriEvents";
import { toast } from "../../lib/toast";
import type { ConnectionsDisplayState } from "./connectionsTheme";

const CONNECTIONS_SETTINGS_QUERY_ROOT = "space-connections-settings";

export function connectionsDisplayState(options: ConnectionsGraphOptions): ConnectionsDisplayState {
	return {
		nodeSizeScale: connectionsNodeSizeScale(options.nodeSize),
		linkOpacity: connectionsLinkOpacity(options.linkOpacity),
		linkThicknessScale: connectionsLinkThicknessScale(options.linkThickness),
		curvature: connectionsLinkCurvature(options.edgeBundling),
	};
}

export function useConnectionsSettings(spacePath: string) {
	const { t } = useTranslation("shell");
	const queryClient = useQueryClient();
	const queryKey = [CONNECTIONS_SETTINGS_QUERY_ROOT, spacePath] as const;

	const settingsQuery = useQuery({
		queryKey,
		enabled: Boolean(spacePath),
		queryFn: () => loadSettings({ spacePath }),
	});

	const optionsMutation = useMutation({
		mutationFn: (next: ConnectionsGraphOptions) =>
			writeSpaceSetting(SPACE_SETTINGS.connectionsGraph, next, { spacePath }),
		onMutate: async (next) => {
			await queryClient.cancelQueries({ queryKey });
			const previous = queryClient.getQueryData<AppSettings>(queryKey);
			queryClient.setQueryData<AppSettings>(queryKey, (current) =>
				current ? { ...current, connectionsGraph: next } : current,
			);
			return { previous };
		},
		onError: (cause, _next, context) => {
			if (context) queryClient.setQueryData(queryKey, context.previous);
			toast.error(t("commandPalette.settingUpdateFailed"), {
				description: extractErrorMessage(cause),
			});
		},
	});

	useTauriEvent("settings:updated", () => {
		void queryClient.invalidateQueries({ queryKey });
	});

	return {
		options: settingsQuery.data?.connectionsGraph ?? DEFAULT_CONNECTIONS_GRAPH_OPTIONS,
		settingsPending: settingsQuery.isPending,
		saveOptions: optionsMutation.mutate,
	};
}
