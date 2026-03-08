export const PATH_REMOVED_EVENT = "glyph:path-removed";
export const PATH_MOVED_EVENT = "glyph:path-moved";

const pendingMovedPaths = new Map<
	string,
	{ toPath: string; expiresAt: number }
>();

export interface PathRemovedDetail {
	path: string;
	recursive: boolean;
}

export interface PathMovedDetail {
	fromPath: string;
	toPath: string;
	recursive: boolean;
}

export function dispatchPathRemoved(detail: PathRemovedDetail) {
	window.dispatchEvent(
		new CustomEvent<PathRemovedDetail>(PATH_REMOVED_EVENT, { detail }),
	);
}

export function dispatchPathMoved(detail: PathMovedDetail) {
	window.dispatchEvent(
		new CustomEvent<PathMovedDetail>(PATH_MOVED_EVENT, { detail }),
	);
}

export function markPendingPathMove(
	fromPath: string,
	toPath: string,
	ttlMs = 3000,
) {
	pendingMovedPaths.set(fromPath, {
		toPath,
		expiresAt: Date.now() + ttlMs,
	});
}

export function hasPendingPathMoveFor(fromPath: string): boolean {
	const pending = pendingMovedPaths.get(fromPath);
	if (!pending) return false;
	if (pending.expiresAt <= Date.now()) {
		pendingMovedPaths.delete(fromPath);
		return false;
	}
	return true;
}

export function getPendingPathMoveTarget(path: string): string | null {
	const now = Date.now();
	for (const [fromPath, pending] of pendingMovedPaths.entries()) {
		if (pending.expiresAt <= now) {
			pendingMovedPaths.delete(fromPath);
			continue;
		}
		if (path === fromPath) return pending.toPath;
		if (path.startsWith(`${fromPath}/`)) {
			return `${pending.toPath}${path.slice(fromPath.length)}`;
		}
	}
	return null;
}

export function hasPendingPathMove(): boolean {
	const now = Date.now();
	for (const [fromPath, pending] of pendingMovedPaths.entries()) {
		if (pending.expiresAt <= now) {
			pendingMovedPaths.delete(fromPath);
			continue;
		}
		return true;
	}
	return false;
}
