import {
	type ConnectionsCommunity,
	type ConnectionsCommunityModel,
	communityBridgeKey,
} from "./connectionsCommunities";
import { spaceConnectionsDensityProfile } from "./connectionsDensity";
import type {
	GraphPosition,
	SerializedGraphPosition,
} from "./connectionsLayout";
import { hashString, randomUnit } from "./connectionsRandom";

const COMMUNITY_GAP = 340;
const CLUSTER_CANDIDATE_COUNT = 36;

function distance(left: GraphPosition, right: GraphPosition) {
	return Math.hypot(left.x - right.x, left.y - right.y);
}

function placeCommunityCenters(model: ConnectionsCommunityModel) {
	const centers = new Map<number, GraphPosition>();
	const placed: ConnectionsCommunity[] = [];

	for (const community of model.communities) {
		if (placed.length === 0) {
			centers.set(community.id, { x: 0, y: 0 });
			placed.push(community);
			continue;
		}

		const connected = placed
			.map((candidate) => ({
				community: candidate,
				weight:
					model.communityBridges.get(
						communityBridgeKey(community.id, candidate.id),
					) ?? 0,
			}))
			.filter(({ weight }) => weight > 0)
			.sort((left, right) => right.weight - left.weight);
		const anchorCommunity = connected[0]?.community ?? placed[0];
		const anchor = anchorCommunity
			? centers.get(anchorCommunity.id)
			: undefined;
		if (!anchorCommunity || !anchor) continue;

		const seed = hashString(`community:${community.hubId}`);
		let bestPosition: GraphPosition | null = null;
		let bestScore = Number.NEGATIVE_INFINITY;
		for (let index = 0; index < CLUSTER_CANDIDATE_COUNT; index += 1) {
			const angle = randomUnit(seed, index * 3) * Math.PI * 2;
			const separation =
				community.radius +
				anchorCommunity.radius +
				COMMUNITY_GAP * (0.9 + randomUnit(seed, index * 3 + 1) * 1.5);
			const candidate = {
				x: anchor.x + Math.cos(angle) * separation,
				y: anchor.y + Math.sin(angle) * separation,
			};
			let clearance = Number.POSITIVE_INFINITY;
			for (const existing of placed) {
				const existingCenter = centers.get(existing.id);
				if (!existingCenter) continue;
				clearance = Math.min(
					clearance,
					distance(candidate, existingCenter) -
						community.radius -
						existing.radius,
				);
			}
			let bridgeDistanceCost = 0;
			for (const neighbor of connected) {
				const neighborCenter = centers.get(neighbor.community.id);
				if (!neighborCenter) continue;
				bridgeDistanceCost +=
					neighbor.weight *
					Math.max(
						0,
						distance(candidate, neighborCenter) -
							community.radius -
							neighbor.community.radius,
					);
			}
			const overlapPenalty = clearance < COMMUNITY_GAP * 0.55 ? 1_000_000 : 0;
			const score =
				Math.min(clearance, COMMUNITY_GAP * 2) -
				bridgeDistanceCost * 0.012 -
				Math.hypot(candidate.x, candidate.y) * 0.015 -
				overlapPenalty;
			if (score > bestScore) {
				bestScore = score;
				bestPosition = candidate;
			}
		}

		centers.set(community.id, bestPosition ?? anchor);
		placed.push(community);
	}

	return centers;
}

function graphDepths(
	community: ConnectionsCommunity,
	adjacency: ConnectionsCommunityModel["adjacency"],
) {
	const members = new Set(community.members);
	const depths = new Map([[community.hubId, 0]]);
	const queue = [community.hubId];
	for (let index = 0; index < queue.length; index += 1) {
		const current = queue[index];
		if (!current) continue;
		const nextDepth = (depths.get(current) ?? 0) + 1;
		for (const neighbor of adjacency.get(current)?.keys() ?? []) {
			if (!members.has(neighbor) || depths.has(neighbor)) continue;
			depths.set(neighbor, nextDepth);
			queue.push(neighbor);
		}
	}
	return depths;
}

function placeCommunityMembers(
	community: ConnectionsCommunity,
	center: GraphPosition,
	model: ConnectionsCommunityModel,
	candidateCount: number,
) {
	const positions = new Map<string, GraphPosition>();
	positions.set(community.hubId, center);
	if (community.members.length === 1) return positions;

	const depths = graphDepths(community, model.adjacency);
	const spacing = Math.max(
		42,
		(community.radius / Math.sqrt(community.members.length)) * 0.68,
	);
	const cellSize = spacing;
	const grid = new Map<string, GraphPosition[]>();
	const cell = (value: number) => Math.floor(value / cellSize);
	const key = (x: number, y: number) => `${x}:${y}`;
	grid.set(key(cell(center.x), cell(center.y)), [center]);
	const nearestDistance = (candidate: GraphPosition) => {
		const x = cell(candidate.x);
		const y = cell(candidate.y);
		let nearest = Number.POSITIVE_INFINITY;
		for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
			for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
				for (const occupant of grid.get(key(x + offsetX, y + offsetY)) ?? []) {
					nearest = Math.min(nearest, distance(candidate, occupant));
				}
			}
		}
		return nearest;
	};

	const orderedMembers = community.members
		.filter((id) => id !== community.hubId)
		.sort((left, right) => {
			const depthDifference =
				(depths.get(left) ?? Number.MAX_SAFE_INTEGER) -
				(depths.get(right) ?? Number.MAX_SAFE_INTEGER);
			if (depthDifference !== 0) return depthDifference;
			return (
				(model.adjacency.get(right)?.size ?? 0) -
					(model.adjacency.get(left)?.size ?? 0) ||
				hashString(left) - hashString(right)
			);
		});

	for (const nodeId of orderedMembers) {
		const seed = hashString(nodeId);
		const depth = depths.get(nodeId) ?? 4;
		const minimumRadius =
			depth <= 1 ? 0.13 : depth === 2 ? 0.34 : depth === 3 ? 0.53 : 0.66;
		const maximumRadius =
			depth <= 1 ? 0.48 : depth === 2 ? 0.72 : depth === 3 ? 0.88 : 1;
		let bestPosition: GraphPosition | null = null;
		let bestDistance = -1;
		for (let index = 0; index < candidateCount; index += 1) {
			const angle = randomUnit(seed, index * 3) * Math.PI * 2;
			const radiusFactor =
				minimumRadius +
				(maximumRadius - minimumRadius) *
					Math.sqrt(randomUnit(seed, index * 3 + 1));
			const candidate = {
				x: center.x + Math.cos(angle) * community.radius * radiusFactor,
				y:
					center.y +
					Math.sin(angle) *
						community.radius *
						radiusFactor *
						(0.72 + randomUnit(seed, index * 3 + 2) * 0.36),
			};
			const candidateDistance = nearestDistance(candidate);
			if (candidateDistance > bestDistance) {
				bestDistance = candidateDistance;
				bestPosition = candidate;
			}
		}
		if (!bestPosition) continue;
		positions.set(nodeId, bestPosition);
		const gridKey = key(cell(bestPosition.x), cell(bestPosition.y));
		const occupants = grid.get(gridKey) ?? [];
		occupants.push(bestPosition);
		grid.set(gridKey, occupants);
	}

	return positions;
}

export function placeConnectionsCommunities(
	model: ConnectionsCommunityModel,
	nodeCount: number,
): SerializedGraphPosition[] {
	const centers = placeCommunityCenters(model);
	const candidateCount = spaceConnectionsDensityProfile(
		nodeCount,
		0,
	).layoutCandidateCount;
	const positions: SerializedGraphPosition[] = [];
	for (const community of model.communities) {
		const center = centers.get(community.id);
		if (!center) continue;
		for (const [id, position] of placeCommunityMembers(
			community,
			center,
			model,
			candidateCount,
		)) {
			positions.push([id, position.x, position.y]);
		}
	}
	return positions;
}
