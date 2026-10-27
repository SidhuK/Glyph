import { UndirectedGraph } from "graphology";
import { bidirectional } from "graphology-shortest-path/unweighted";
import type { ConnectionsGraph } from "./connectionsGraph";

const undirectedViews = new WeakMap<ConnectionsGraph, UndirectedGraph>();

/** Note links are directed, but a route between two notes may follow them either way. */
function undirectedView(graph: ConnectionsGraph): UndirectedGraph {
	const cached = undirectedViews.get(graph);
	if (cached) return cached;
	const view = new UndirectedGraph();
	graph.forEachNode((id) => view.addNode(id));
	graph.forEachEdge((_edge, _attributes, source, target) => {
		if (source !== target) view.mergeEdge(source, target);
	});
	undirectedViews.set(graph, view);
	return view;
}

export function findConnectionsPath(
	graph: ConnectionsGraph,
	fromId: string,
	toId: string,
): string[] | null {
	if (fromId === toId || !graph.hasNode(fromId) || !graph.hasNode(toId)) return null;
	return bidirectional(undirectedView(graph), fromId, toId);
}
