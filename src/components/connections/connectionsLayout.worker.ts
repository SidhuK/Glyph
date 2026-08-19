import type { ConnectionsLayoutGraph } from "./connectionsCommunities";
import {
	type ConnectionsLayoutResponse,
	computeSpaceConnectionsLayout,
} from "./connectionsLayout";

interface ConnectionsWorkerScope {
	onmessage:
		| ((event: MessageEvent<ConnectionsLayoutGraph>) => void)
		| null;
	postMessage: (response: ConnectionsLayoutResponse) => void;
}

const workerScope = self as unknown as ConnectionsWorkerScope;

workerScope.onmessage = (event) => {
	let response: ConnectionsLayoutResponse;

	try {
		response = {
			positions: computeSpaceConnectionsLayout(event.data),
		};
	} catch (cause) {
		response = {
			error: cause instanceof Error ? cause.message : String(cause),
		};
	}

	workerScope.postMessage(response);
};
