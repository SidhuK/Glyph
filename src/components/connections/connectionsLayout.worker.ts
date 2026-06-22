import {
	computeSpaceConnectionsLayout,
	type ConnectionsLayoutRequest,
	type ConnectionsLayoutResponse,
} from "./connectionsLayout";

interface ConnectionsWorkerScope {
	onmessage: ((event: MessageEvent<ConnectionsLayoutRequest>) => void) | null;
	postMessage: (response: ConnectionsLayoutResponse) => void;
}

const workerScope = self as unknown as ConnectionsWorkerScope;

workerScope.onmessage = (event) => {
	const { requestId, ids } = event.data;
	let response: ConnectionsLayoutResponse;

	try {
		response = {
			requestId,
			positions: computeSpaceConnectionsLayout(ids),
		};
	} catch (cause) {
		response = {
			requestId,
			error: cause instanceof Error ? cause.message : String(cause),
		};
	}

	workerScope.postMessage(response);
};

export {};
