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
/** Fewest notes a cluster needs to earn its own hue and arc; smaller ones share a neutral run. */
const MIN_HUED_COMMUNITY_NOTES = 3;
const MAX_GAP_ANGLE = FULL_CIRCLE * 0.012;
const MAX_TOTAL_GAP_SHARE = 0.15;
/** Unlinked notes pack into at most this many rows just inside the ring, so they never set its shape. */
const MAX_ISOLATED_ROWS = 4;
/** The unlinked block aims to be no wider than this share of the linked notes' columns. */
const ISOLATED_COLUMN_SHARE = 0.25;
/** Unlinked notes sit this many ring steps apart, both along and across the ring, so the block stays airy. */
const ISOLATED_SPACING = 1.3;

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
		if (community.noteCount >= MIN_HUED_COMMUNITY_NOTES && isConnectionsCommunityHue(nextHue)) {
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
	const ordered = interleaveNeutralClusters(segments);
	// Isolated notes share one block so they never dilute the clusters.
	if (isolated.length > 0) ordered.push({ kind: "isolated", members: isolated.sort(byHash) });
	return ordered;
}

/**
 * Spreads the small neutral clusters across the gaps after each hued cluster, filling the
 * lightest gap first, so colour reaches the whole ring instead of one grey run on one side.
 */
function interleaveNeutralClusters(segments: readonly RingSegment[]) {
	const hued = segments.filter((segment) => !isNeutralCluster(segment));
	const neutral = segments.filter(isNeutralCluster);
	if (hued.length === 0) return [...neutral];
	const slots = hued.map((segment) => ({ weight: segment.members.length, segments: [segment] }));
	for (const segment of neutral) {
		const lightest = slots.reduce((min, slot) => (slot.weight < min.weight ? slot : min));
		lightest.segments.push(segment);
		lightest.weight += segment.members.length;
	}
	return slots.flatMap((slot) => slot.segments);
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

function isolatedRowCount(segments: readonly RingSegment[]) {
	let linked = 0;
	let isolated = 0;
	for (const segment of segments) {
		if (segment.kind === "isolated") isolated += segment.members.length;
		else linked += segment.members.length;
	}
	if (linked === 0 || isolated === 0) return 1;
	const columnBudget = Math.max(1, Math.round(linked * ISOLATED_COLUMN_SHARE));
	return Math.min(MAX_ISOLATED_ROWS, Math.ceil(isolated / columnBudget));
}

/** Ring columns a segment occupies; the unlinked block stacks its notes into rows. */
function segmentColumns(segment: RingSegment, isolatedRows: number) {
	if (segment.kind === "cluster") return segment.members.length;
	return Math.ceil(segment.members.length / isolatedRows) * ISOLATED_SPACING;
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
	const isolatedRows = isolatedRowCount(segments);
	const columns = segments.map((segment) => segmentColumns(segment, isolatedRows));
	const columnCount = columns.reduce((total, count) => total + count, 0);
	if (columnCount === 0) return { positions: [], communities: [] };

	const gaps = segments.map((_segment, index) => hasGapAfter(segments, index));
	const gapCount = gaps.filter(Boolean).length;
	const gapAngle =
		gapCount > 0 ? Math.min(MAX_GAP_ANGLE, (FULL_CIRCLE * MAX_TOTAL_GAP_SHARE) / gapCount) : 0;
	const columnAngle = (FULL_CIRCLE - gapAngle * gapCount) / columnCount;
	// Rows sit one ring step apart, matching the spacing between neighbouring notes.
	const rowStep = columnAngle * CONNECTIONS_RING_RADIUS;

	// Center the last segment (the unlinked block when present) at the bottom.
	const lastIndex = segments.length - 1;
	const lastSpan = (columns[lastIndex] ?? 0) * columnAngle;
	const lastGap = gaps[lastIndex] ? gapAngle : 0;
	let cursor = BOTTOM_ANGLE + lastGap + lastSpan / 2;

	const positions: SerializedGraphPosition[] = [];
	const communities: ConnectionsCommunityLayout[] = [];
	segments.forEach((segment, communityIndex) => {
		const startAngle = cursor;
		const endAngle = startAngle + (columns[communityIndex] ?? 0) * columnAngle;
		const midAngle = (startAngle + endAngle) / 2;
		const bundleX = Math.cos(midAngle) * BUNDLE_RING_RADIUS;
		const bundleY = Math.sin(midAngle) * BUNDLE_RING_RADIUS;
		const isolated = segment.kind === "isolated";
		const rows = isolated ? isolatedRows : 1;
		const spacing = isolated ? ISOLATED_SPACING : 1;
		segment.members.forEach((id, index) => {
			const angle = startAngle + (Math.floor(index / rows) + 0.5) * columnAngle * spacing;
			const radius = CONNECTIONS_RING_RADIUS - (index % rows) * rowStep * spacing;
			positions.push([
				id,
				Math.cos(angle) * radius,
				Math.sin(angle) * radius,
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
