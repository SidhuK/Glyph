import type { ConnectionsWeightedGraph } from "./connectionsCommunities";
import { hashString } from "./connectionsRandom";

/** Smaller groups fold into their best-linked neighbour, or into one shared group of loose notes. */
const MIN_COMMUNITY_SIZE = 3;

/** The group `nodeIds` link to most by summed edge weight, ignoring `skip`; ties go to the lower group. */
function weightByGroup(
	nodeIds: Iterable<string>,
	owner: ReadonlyMap<string, number>,
	graph: ConnectionsWeightedGraph,
	skip: number | null,
) {
	const weights = new Map<number, number>();
	for (const nodeId of nodeIds) {
		graph.forEachEdge(nodeId, (_edge, { weight }, source, target) => {
			const group = owner.get(source === nodeId ? target : source);
			if (group === undefined || group === skip) return;
			weights.set(group, (weights.get(group) ?? 0) + weight);
		});
	}
	let best: number | null = null;
	let bestWeight = 0;
	for (const [group, weight] of weights) {
		if (weight > bestWeight || (weight === bestWeight && best !== null && group < best)) {
			best = group;
			bestWeight = weight;
		}
	}
	return best;
}

/** Louvain may park a tag with a minority of its notes; move each tag to the group it links to most. */
export function assignTagsToBestGroup(
	owner: Map<string, number>,
	tagIds: ReadonlySet<string>,
	graph: ConnectionsWeightedGraph,
) {
	for (const tagId of [...tagIds].sort()) {
		if (!owner.has(tagId)) continue;
		const best = weightByGroup([tagId], owner, graph, null);
		if (best !== null) owner.set(tagId, best);
	}
}

/** Louvain can group nodes that aren't connected; each connected piece becomes its own group. */
export function connectedGroups(
	owner: ReadonlyMap<string, number>,
	graph: ConnectionsWeightedGraph,
) {
	const byGroup = new Map<number, Set<string>>();
	for (const [nodeId, group] of owner) {
		const members = byGroup.get(group) ?? new Set<string>();
		members.add(nodeId);
		byGroup.set(group, members);
	}

	const components: string[][] = [];
	for (const members of byGroup.values()) {
		const remaining = new Set(members);
		for (const first of members) {
			if (!remaining.delete(first)) continue;
			const component = [first];
			for (let index = 0; index < component.length; index += 1) {
				for (const neighbor of graph.neighbors(component[index] ?? "")) {
					if (remaining.delete(neighbor)) component.push(neighbor);
				}
			}
			components.push(component);
		}
	}
	return components.sort(
		(left, right) =>
			left.length - right.length || hashString(left[0] ?? "") - hashString(right[0] ?? ""),
	);
}

/** Folds groups below `MIN_COMMUNITY_SIZE` into their best-linked neighbour; the rest pool as loose notes. */
export function foldTinyGroups(groups: string[][], graph: ConnectionsWeightedGraph) {
	const owner = new Map<string, number>();
	groups.forEach((members, group) => {
		for (const id of members) owner.set(id, group);
	});
	const loose: string[] = [];
	groups.forEach((members, group) => {
		if (members.length === 0 || members.length >= MIN_COMMUNITY_SIZE) return;
		const target = weightByGroup(members, owner, graph, group);
		for (const id of members) {
			if (target === null) owner.delete(id);
			else owner.set(id, target);
		}
		(target === null ? loose : groups[target])?.push(...members.splice(0));
	});
	return { groups: groups.filter((members) => members.length > 0), loose };
}
