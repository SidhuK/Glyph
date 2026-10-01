import {
	type ConnectionsCommunity,
	type ConnectionsCommunityModel,
	type ConnectionsCommunityTone,
	NEUTRAL_COMMUNITY_TONE,
	isConnectionsCommunityHue,
} from "./connectionsCommunities";
import type {
	ConnectionsCommunityLayout,
	SerializedConnectionsLayout,
	SerializedGraphPosition,
} from "./connectionsLayout";
import { hashString } from "./connectionsRandom";

const FULL_CIRCLE = Math.PI * 2;
/** Graph space is y-up, so -π/2 is the bottom of the ring. */
const BOTTOM_ANGLE = -Math.PI / 2;
export const CONNECTIONS_RING_RADIUS = 1_000;
const BUNDLE_RING_RADIUS = 360;
/** Smallest cluster that earns its own hue and arc; smaller ones share a neutral run. */
const MIN_HUED_COMMUNITY_SIZE = 3;
const MAX_GAP_ANGLE = FULL_CIRCLE * 0.012;
const MAX_TOTAL_GAP_SHARE = 0.15;

type ClusterCommunity = Extract<ConnectionsCommunity, { kind: "cluster" }>;

type RingSegment =
	| {
			readonly kind: "cluster";
			readonly hubId: string;
			readonly members: readonly string[];
			readonly tone: ConnectionsCommunityTone;
	  }
	| { readonly kind: "isolated"; readonly members: readonly string[] };

function byHash(left: string, right: string) {
	return hashString(left) - hashString(right);
}

/** Centers the hub so its forced label sits over the middle of the community arc. */
function orderedMembers({ members, hubId }: ClusterCommunity) {
	const rest = members.filter((id) => id !== hubId).sort(byHash);
	const middle = Math.floor(rest.length / 2);
	return [...rest.slice(0, middle), hubId, ...rest.slice(middle)];
}

function ringSegments(communities: readonly ConnectionsCommunity[]) {
	const segments: RingSegment[] = [];
	const isolated: string[] = [];
	let nextHue = 0;
	for (const community of communities) {
		if (community.kind === "isolated") {
			isolated.push(community.nodeId);
			continue;
		}
		let tone = NEUTRAL_COMMUNITY_TONE;
		if (community.members.length >= MIN_HUED_COMMUNITY_SIZE && isConnectionsCommunityHue(nextHue)) {
			tone = { kind: "hue", hue: nextHue };
			nextHue += 1;
		}
		segments.push({
			kind: "cluster",
			hubId: community.hubId,
			members: orderedMembers(community),
			tone,
		});
	}
	// Isolated notes share one block so they never dilute the clusters.
	if (isolated.length > 0) segments.push({ kind: "isolated", members: isolated.sort(byHash) });
	return segments;
}

function isNeutralCluster(segment: RingSegment) {
	return segment.kind === "cluster" && segment.tone.kind === "neutral";
}

/** Small neutral clusters run together; every other boundary gets breathing room. */
function hasGapAfter(segments: readonly RingSegment[], index: number) {
	if (segments.length < 2) return false;
	const current = segments[index];
	const next = segments[(index + 1) % segments.length];
	if (!current || !next) return false;
	return !(isNeutralCluster(current) && isNeutralCluster(next));
}

function toLayoutCommunity(
	segment: RingSegment,
	startAngle: number,
	endAngle: number,
): ConnectionsCommunityLayout {
	if (segment.kind === "isolated") return { kind: "isolated", startAngle, endAngle };
	return { kind: "cluster", hubId: segment.hubId, tone: segment.tone, startAngle, endAngle };
}

export function placeConnectionsCommunities(
	model: ConnectionsCommunityModel,
): SerializedConnectionsLayout {
	const segments = ringSegments(model.communities);
	const nodeCount = segments.reduce((total, segment) => total + segment.members.length, 0);
	if (nodeCount === 0) return { positions: [], communities: [] };

	const gaps = segments.map((_segment, index) => hasGapAfter(segments, index));
	const gapCount = gaps.filter(Boolean).length;
	const gapAngle =
		gapCount > 0 ? Math.min(MAX_GAP_ANGLE, (FULL_CIRCLE * MAX_TOTAL_GAP_SHARE) / gapCount) : 0;
	const nodeAngle = (FULL_CIRCLE - gapAngle * gapCount) / nodeCount;

	// Center the last segment (the isolated block when present) at the bottom.
	const lastIndex = segments.length - 1;
	const lastSpan = (segments[lastIndex]?.members.length ?? 0) * nodeAngle;
	const lastGap = gaps[lastIndex] ? gapAngle : 0;
	let cursor = BOTTOM_ANGLE + lastGap + lastSpan / 2;

	const positions: SerializedGraphPosition[] = [];
	const communities: ConnectionsCommunityLayout[] = [];
	segments.forEach((segment, communityIndex) => {
		const startAngle = cursor;
		const endAngle = startAngle + segment.members.length * nodeAngle;
		const midAngle = (startAngle + endAngle) / 2;
		const bundleX = Math.cos(midAngle) * BUNDLE_RING_RADIUS;
		const bundleY = Math.sin(midAngle) * BUNDLE_RING_RADIUS;
		segment.members.forEach((id, index) => {
			const angle = startAngle + (index + 0.5) * nodeAngle;
			positions.push([
				id,
				Math.cos(angle) * CONNECTIONS_RING_RADIUS,
				Math.sin(angle) * CONNECTIONS_RING_RADIUS,
				bundleX,
				bundleY,
				communityIndex,
			]);
		});
		communities.push(toLayoutCommunity(segment, startAngle, endAngle));
		cursor = endAngle + (gaps[communityIndex] ? gapAngle : 0);
	});

	return { positions, communities };
}
