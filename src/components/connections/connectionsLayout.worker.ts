import {
	type ConnectionsLayoutRequest,
	type ConnectionsLayoutResponse,
	computeSpaceConnectionsLayout,
} from "./connectionsLayout";

interface ConnectionsWorkerScope {
	onmessage: ((event: MessageEvent<ConnectionsLayoutRequest>) => void) | null;
	postMessage: (response: ConnectionsLayoutResponse) => void;
}

const workerScope = self as unknown as ConnectionsWorkerScope;

workerScope.onmessage = (event) => {
	const { graph, forces } = event.data;
	let response: ConnectionsLayoutResponse;

	try {
		response = {
			positions: computeSpaceConnectionsLayout(graph, forces),
		};
	} catch (cause) {
		response = {
			error: cause instanceof Error ? cause.message : String(cause),
		};
	}

	workerScope.postMessage(response);
};
