import type { ConnectionsLayoutGraph } from "./connectionsCommunities";
import { type ConnectionsLayoutResponse, computeSpaceConnectionsLayout } from "./connectionsLayout";

interface ConnectionsWorkerScope {
	onmessage: ((event: MessageEvent<ConnectionsLayoutGraph>) => void) | null;
	postMessage: (response: ConnectionsLayoutResponse) => void;
}

const workerScope = self as unknown as ConnectionsWorkerScope;

workerScope.onmessage = (event) => {
	let response: ConnectionsLayoutResponse;

	try {
		response = {
			kind: "ready",
			layout: computeSpaceConnectionsLayout(event.data),
		};
	} catch (cause) {
		response = {
			kind: "error",
			error: cause instanceof Error ? cause.message : String(cause),
		};
	}

	workerScope.postMessage(response);
};
