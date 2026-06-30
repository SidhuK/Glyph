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
	const { requestId, graph } = event.data;
	let response: ConnectionsLayoutResponse;

	try {
		response = {
			requestId,
			positions: computeSpaceConnectionsLayout(graph),
		};
	} catch (cause) {
		response = {
			requestId,
			error: cause instanceof Error ? cause.message : String(cause),
		};
	}

	workerScope.postMessage(response);
};
