import type { ConnectionsGraph } from "./connectionsGraph";

function nodeMatchesSearch(id: string, label: string, needle: string) {
	if (label.toLocaleLowerCase().includes(needle)) return true;
	const path = id.replace(/\\/g, "/").toLocaleLowerCase();
	if (path.includes(needle)) return true;
	const stem = (path.split("/").pop() ?? "").replace(/\.md$/i, "");
	return stem.includes(needle);
}

export function connectionsSearchMatchIds(graph: ConnectionsGraph | null, query: string) {
	const needle = query.trim().toLocaleLowerCase();
	if (!graph || !needle) return null;
	const matches = new Set<string>();
	for (const id of graph.nodes()) {
		if (nodeMatchesSearch(id, graph.getNodeAttribute(id, "label"), needle)) matches.add(id);
	}
	return matches;
}
