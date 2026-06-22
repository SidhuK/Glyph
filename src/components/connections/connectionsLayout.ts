import { connectionsDensityProfile } from "./connectionsDensity";

export interface GraphPosition {
	x: number;
	y: number;
}

export type SerializedGraphPosition = readonly [
	id: string,
	x: number,
	y: number,
];

export interface ConnectionsLayoutRequest {
	requestId: number;
	ids: string[];
}

export type ConnectionsLayoutResponse =
	| {
			requestId: number;
			positions: SerializedGraphPosition[];
	  }
	| {
			requestId: number;
			error: string;
	  };

function hashString(value: string) {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function randomUnit(seed: number, salt: number) {
	let value = seed ^ Math.imul(salt + 1, 0x9e3779b1);
	value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
	value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
	return ((value ^ (value >>> 15)) >>> 0) / 0xffffffff;
}

export function computeSpaceConnectionsLayout(ids: string[]) {
	const orderedIds = [...ids].sort(
		(left, right) => hashString(left) - hashString(right),
	);
	const nodeCount = orderedIds.length;
	if (nodeCount === 0) return [];

	const extent = Math.max(1200, Math.sqrt(nodeCount) * 180);
	const cellSize = Math.max(80, (extent / Math.sqrt(nodeCount)) * 0.78);
	const { layoutCandidateCount: candidateCount } = connectionsDensityProfile(
		"space",
		nodeCount,
		0,
	);
	const clusterCount = Math.min(
		12,
		Math.max(4, Math.round(Math.sqrt(nodeCount) / 12)),
	);
	const layoutSeed = hashString("glyph-space-connections");
	const clusterCenters = Array.from({ length: clusterCount }, (_, index) => ({
		x: (randomUnit(layoutSeed, index * 3) * 2 - 1) * extent * 0.82,
		y: (randomUnit(layoutSeed, index * 3 + 1) * 2 - 1) * extent * 0.62,
		spread: extent * (0.17 + randomUnit(layoutSeed, index * 3 + 2) * 0.11),
	}));
	const positions = new Map<string, GraphPosition>();
	const spatialGrid = new Map<string, GraphPosition[]>();

	const gridCoordinate = (value: number) => Math.floor(value / cellSize);
	const gridKey = (x: number, y: number) => `${x}:${y}`;
	const nearestDistanceSquared = (candidate: GraphPosition) => {
		const cellX = gridCoordinate(candidate.x);
		const cellY = gridCoordinate(candidate.y);
		let nearest = Number.POSITIVE_INFINITY;

		for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
			for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
				const nearby = spatialGrid.get(
					gridKey(cellX + offsetX, cellY + offsetY),
				);
				if (!nearby) continue;
				for (const position of nearby) {
					const deltaX = candidate.x - position.x;
					const deltaY = candidate.y - position.y;
					nearest = Math.min(nearest, deltaX * deltaX + deltaY * deltaY);
				}
			}
		}

		return nearest;
	};

	for (const id of orderedIds) {
		const seed = hashString(id);
		let bestPosition: GraphPosition | null = null;
		let bestDistance = -1;

		for (
			let candidateIndex = 0;
			candidateIndex < candidateCount;
			candidateIndex += 1
		) {
			const salt = candidateIndex * 5;
			const isOutlier = randomUnit(seed, salt) < 0.02;
			let candidate: GraphPosition;

			if (isOutlier) {
				candidate = {
					x: (randomUnit(seed, salt + 1) * 2 - 1) * extent * 1.12,
					y: (randomUnit(seed, salt + 2) * 2 - 1) * extent * 0.86,
				};
			} else {
				const clusterIndex = Math.min(
					clusterCount - 1,
					Math.floor(randomUnit(seed, salt + 1) * clusterCount),
				);
				const center = clusterCenters[clusterIndex];
				if (!center) continue;
				const uniformA = Math.max(randomUnit(seed, salt + 2), 0.000001);
				const uniformB = randomUnit(seed, salt + 3);
				const magnitude = Math.min(Math.sqrt(-2 * Math.log(uniformA)), 2.8);
				const angle = uniformB * Math.PI * 2;
				candidate = {
					x: center.x + Math.cos(angle) * magnitude * center.spread,
					y: center.y + Math.sin(angle) * magnitude * center.spread,
				};
			}

			const distance = nearestDistanceSquared(candidate);
			if (distance > bestDistance) {
				bestPosition = candidate;
				bestDistance = distance;
			}
		}

		if (!bestPosition) continue;
		positions.set(id, bestPosition);
		const key = gridKey(
			gridCoordinate(bestPosition.x),
			gridCoordinate(bestPosition.y),
		);
		const occupants = spatialGrid.get(key) ?? [];
		occupants.push(bestPosition);
		spatialGrid.set(key, occupants);
	}

	return [...positions].map(
		([id, position]) => [id, position.x, position.y] as const,
	);
}
