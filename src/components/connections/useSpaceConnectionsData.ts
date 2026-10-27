import { useQuery, useQueryClient } from "@tanstack/react-query";
import { i18n } from "../../i18n";
import type { ConnectionsGraphOptions } from "../../lib/connectionsGraphOptions";
import { extractErrorMessage } from "../../lib/errorUtils";
import type { SpaceConnections } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { useSpaceConnectionsGraph } from "./useSpaceConnectionsGraph";

const LARGE_GRAPH_NOTE_THRESHOLD = 5_000;
const CONNECTIONS_QUERY_ROOT = "space-connections";
const warnedLargeGraphSpaces = new Set<string>();

async function warnAboutLargeGraph(payload: SpaceConnections) {
	const { message } = await import("@tauri-apps/plugin-dialog");
	await message(i18n.t("shell:connections.largeGraphBody", { count: payload.nodes.length }), {
		title: i18n.t("shell:connections.largeGraphTitle"),
		kind: "warning",
		okLabel: i18n.t("shell:connections.largeGraphContinue"),
	});
}

/** Loads the space's connections payload and its laid-out graph. */
export function useSpaceConnectionsData(spacePath: string, options: ConnectionsGraphOptions) {
	const queryClient = useQueryClient();
	const connectionsQuery = useQuery({
		queryKey: [CONNECTIONS_QUERY_ROOT, spacePath],
		enabled: Boolean(spacePath),
		gcTime: 0,
		queryFn: async () => {
			const payload = await invoke("space_connections");
			if (
				payload.nodes.length > LARGE_GRAPH_NOTE_THRESHOLD &&
				!warnedLargeGraphSpaces.has(spacePath)
			) {
				warnedLargeGraphSpaces.add(spacePath);
				await warnAboutLargeGraph(payload);
			}
			return payload;
		},
	});

	useTauriEvent("space:fs_changed", () => {
		void queryClient.invalidateQueries({ queryKey: [CONNECTIONS_QUERY_ROOT, spacePath] });
	});

	const payload = connectionsQuery.data ?? null;
	const { filteredPayload, graph, layoutError, layoutLoading, refetchLayout } =
		useSpaceConnectionsGraph(payload, spacePath, options);

	return {
		payload,
		filteredPayload,
		graph,
		dataLoading: connectionsQuery.isPending,
		layoutLoading,
		error:
			(connectionsQuery.error ? extractErrorMessage(connectionsQuery.error) : "") || layoutError,
		retry: () => {
			void connectionsQuery.refetch();
			void refetchLayout();
		},
	};
}
