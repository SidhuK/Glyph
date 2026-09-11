import type {
	ConnectionsCommunity,
	ConnectionsCommunityModel,
} from "./connectionsCommunities";
import type { SerializedGraphPosition } from "./connectionsLayout";
import { hashString } from "./connectionsRandom";

const FULL_CIRCLE = Math.PI * 2;
const START_ANGLE = -Math.PI / 2;
const NODE_RING_RADIUS = 1_000;
const BUNDLE_RING_RADIUS = 360;

interface RadialMember {
	readonly id: string;
	readonly communityId: string;
}

interface CommunityDirection {
	x: number;
	y: number;
}

function orderedMembers(community: ConnectionsCommunity) {
	return [...community.members].sort((left, right) => {
		if (left === community.hubId) return -1;
		if (right === community.hubId) return 1;
		return hashString(left) - hashString(right);
	});
}

function partitionMembers(communities: readonly ConnectionsCommunity[]) {
	const connected: RadialMember[] = [];
	const disconnected: RadialMember[] = [];
	for (const community of communities) {
		const members = community.members.length > 1 ? connected : disconnected;
		for (const id of orderedMembers(community)) {
			members.push({ id, communityId: community.hubId });
		}
	}
	return { connected, disconnected };
}

function distributeAroundRing(
	connected: readonly RadialMember[],
	disconnected: readonly RadialMember[],
) {
	const nodeCount = connected.length + disconnected.length;
	const slots = new Array<RadialMember | undefined>(nodeCount);

	if (connected.length > 0) {
		connected.forEach((member, index) => {
			const slot = Math.floor(((index + 0.5) * nodeCount) / connected.length);
			slots[slot] = member;
		});
	}

	const remaining = [...disconnected].sort(
		(left, right) => hashString(left.id) - hashString(right.id),
	);
	let remainingIndex = 0;
	for (let slot = 0; slot < slots.length; slot += 1) {
		if (slots[slot]) continue;
		const member = remaining[remainingIndex];
		if (!member) continue;
		slots[slot] = member;
		remainingIndex += 1;
	}

	return slots;
}

function communityBundlePoints(slots: readonly (RadialMember | undefined)[]) {
	const directions = new Map<string, CommunityDirection>();
	slots.forEach((member, slot) => {
		if (!member) return;
		const angle = START_ANGLE + ((slot + 0.5) * FULL_CIRCLE) / slots.length;
		const direction = directions.get(member.communityId) ?? { x: 0, y: 0 };
		direction.x += Math.cos(angle);
		direction.y += Math.sin(angle);
		directions.set(member.communityId, direction);
	});

	const bundlePoints = new Map<string, CommunityDirection>();
	for (const [communityId, direction] of directions) {
		const magnitude = Math.hypot(direction.x, direction.y);
		bundlePoints.set(
			communityId,
			magnitude < 0.001
				? { x: 0, y: 0 }
				: {
						x: (direction.x / magnitude) * BUNDLE_RING_RADIUS,
						y: (direction.y / magnitude) * BUNDLE_RING_RADIUS,
					},
		);
	}
	return bundlePoints;
}

export function placeConnectionsCommunities(
	model: ConnectionsCommunityModel,
): SerializedGraphPosition[] {
	const { connected, disconnected } = partitionMembers(model.communities);
	const slots = distributeAroundRing(connected, disconnected);
	if (slots.length === 0) return [];

	const bundlePoints = communityBundlePoints(slots);
	const positions: SerializedGraphPosition[] = [];
	slots.forEach((member, slot) => {
		if (!member) return;
		const angle = START_ANGLE + ((slot + 0.5) * FULL_CIRCLE) / slots.length;
		const bundlePoint = bundlePoints.get(member.communityId) ?? { x: 0, y: 0 };
		positions.push([
			member.id,
			Math.cos(angle) * NODE_RING_RADIUS,
			Math.sin(angle) * NODE_RING_RADIUS,
			bundlePoint.x,
			bundlePoint.y,
		]);
	});

	return positions;
}
