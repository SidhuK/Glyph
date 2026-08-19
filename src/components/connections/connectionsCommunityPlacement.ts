import {
	type ConnectionsCommunity,
	type ConnectionsCommunityModel,
	communityBridgeKey,
} from "./connectionsCommunities";
import type {
	GraphPosition,
	SerializedGraphPosition,
} from "./connectionsLayout";
import { hashString, randomUnit } from "./connectionsRandom";

const COMMUNITY_GAP = 22;
const MEMBER_SPACING = 18;
const PACK_SLOT_COUNT = 160;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function distance(left: GraphPosition, right: GraphPosition) {
	return Math.hypot(left.x - right.x, left.y - right.y);
}

interface PackedCircle {
	id: number;
	center: GraphPosition;
	radius: number;
}

function clearanceToPacked(
	candidate: GraphPosition,
	radius: number,
	packed: readonly PackedCircle[],
) {
	let clearance = Number.POSITIVE_INFINITY;
	for (const existing of packed) {
		clearance = Math.min(
			clearance,
			distance(candidate, existing.center) - radius - existing.radius,
		);
	}
	return clearance;
}

function placeCommunityCenters(
	cores: readonly ConnectionsCommunity[],
	model: ConnectionsCommunityModel,
) {
	const centers = new Map<number, GraphPosition>();
	const packed: PackedCircle[] = [];

	for (const community of cores) {
		if (packed.length === 0) {
			const origin = { x: 0, y: 0 };
			centers.set(community.id, origin);
			packed.push({
				id: community.id,
				center: origin,
				radius: community.radius,
			});
			continue;
		}

		const linked = packed.flatMap((circle) => {
			const weight =
				model.communityBridges.get(
					communityBridgeKey(community.id, circle.id),
				) ?? 0;
			return weight > 0 ? [{ circle, weight }] : [];
		});
		const seed = hashString(`community:${community.hubId}`);
		const step = Math.max(community.radius * 0.38, COMMUNITY_GAP);
		let bestPosition: GraphPosition | null = null;
		let bestScore = Number.NEGATIVE_INFINITY;
		for (let index = 0; index < PACK_SLOT_COUNT; index += 1) {
			const radius = step * Math.sqrt(index + 1);
			const angle = index * GOLDEN_ANGLE + randomUnit(seed, 1) * 0.12;
			const candidate = {
				x: Math.cos(angle) * radius,
				y: Math.sin(angle) * radius,
			};
			const clearance = clearanceToPacked(
				candidate,
				community.radius,
				packed,
			);
			if (clearance < COMMUNITY_GAP * 0.2) continue;
			let bridgeCost = 0;
			for (const neighbor of linked) {
				bridgeCost +=
					neighbor.weight *
					Math.max(
						0,
						distance(candidate, neighbor.circle.center) -
							community.radius -
							neighbor.circle.radius,
					);
			}
			const extraGap = Math.max(0, clearance - COMMUNITY_GAP);
			const score =
				-Math.hypot(candidate.x, candidate.y) * 0.12 -
				extraGap * 1.6 -
				bridgeCost * 0.05;
			if (score > bestScore) {
				bestScore = score;
				bestPosition = candidate;
			}
		}

		const center = bestPosition ?? packed[0]?.center ?? { x: 0, y: 0 };
		centers.set(community.id, center);
		packed.push({
			id: community.id,
			center,
			radius: community.radius,
		});
	}

	return centers;
}

function placeCommunityMembers(
	community: ConnectionsCommunity,
	center: GraphPosition,
) {
	const positions = new Map<string, GraphPosition>();
	positions.set(community.hubId, center);
	const members = community.members
		.filter((id) => id !== community.hubId)
		.sort((left, right) => hashString(left) - hashString(right));
	if (members.length === 0) return positions;

	const radialStep = Math.min(
		MEMBER_SPACING,
		community.radius / Math.sqrt(members.length),
	);
	members.forEach((id, index) => {
		const radius = radialStep * Math.sqrt(index + 1);
		const angle = index * GOLDEN_ANGLE;
		positions.set(id, {
			x: center.x + Math.cos(angle) * radius,
			y: center.y + Math.sin(angle) * radius,
		});
	});
	return positions;
}

function placeDust(
	ids: readonly string[],
	cores: readonly PackedCircle[],
	spacing: number,
) {
	const positions = new Map<string, GraphPosition>();
	const ordered = [...ids].sort(
		(left, right) => hashString(left) - hashString(right),
	);
	let slot = 0;
	for (const id of ordered) {
		let placed = false;
		for (let attempt = 0; attempt < 32; attempt += 1) {
			const radius = spacing * Math.sqrt(slot + 1);
			const angle = slot * GOLDEN_ANGLE;
			slot += 1;
			const candidate = {
				x: Math.cos(angle) * radius,
				y: Math.sin(angle) * radius,
			};
			const blocked = cores.some(
				(core) =>
					distance(candidate, core.center) < core.radius + spacing * 0.3,
			);
			if (!blocked) {
				positions.set(id, candidate);
				placed = true;
				break;
			}
		}
		if (placed) continue;
		const radius = spacing * Math.sqrt(slot + 1);
		const angle = slot * GOLDEN_ANGLE;
		positions.set(id, {
			x: Math.cos(angle) * radius,
			y: Math.sin(angle) * radius,
		});
	}
	return positions;
}

export function placeConnectionsCommunities(
	model: ConnectionsCommunityModel,
): SerializedGraphPosition[] {
	const cores = model.communities.filter(
		(community) => community.members.length >= 2,
	);
	const leftover = model.communities
		.filter((community) => community.members.length < 2)
		.flatMap((community) => community.members);
	const toPack = cores.length > 0 ? cores : model.communities;
	const dust = cores.length > 0 ? leftover : [];
	const centers = placeCommunityCenters(toPack, model);
	const packedCores: PackedCircle[] = [];
	const positions: SerializedGraphPosition[] = [];

	for (const community of toPack) {
		const center = centers.get(community.id);
		if (!center) continue;
		packedCores.push({
			id: community.id,
			center,
			radius: community.radius,
		});
		for (const [id, position] of placeCommunityMembers(community, center)) {
			positions.push([id, position.x, position.y]);
		}
	}

	for (const [id, position] of placeDust(dust, packedCores, MEMBER_SPACING)) {
		positions.push([id, position.x, position.y]);
	}
	return positions;
}
