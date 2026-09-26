import type {
	RecoveryCurrentNote,
	RecoveryPreview,
	RecoverySnapshot,
	RecoverySnapshotId,
} from "../../lib/tauri";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSnapshotId(value: unknown): value is RecoverySnapshotId {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function parseSnapshot(value: unknown): RecoverySnapshot {
	if (
		!isRecord(value) ||
		!isSnapshotId(value.id) ||
		typeof value.path !== "string" ||
		value.path.length === 0 ||
		typeof value.timestamp_ms !== "number" ||
		!Number.isSafeInteger(value.timestamp_ms) ||
		value.timestamp_ms < 0 ||
		!Number.isFinite(new Date(value.timestamp_ms).getTime()) ||
		typeof value.deleted !== "boolean"
	) {
		throw new Error("recovery_invalid_response");
	}
	return {
		id: value.id,
		path: value.path,
		timestamp_ms: value.timestamp_ms,
		deleted: value.deleted,
	};
}

export function parseSnapshots(value: unknown): RecoverySnapshot[] {
	if (!Array.isArray(value)) throw new Error("recovery_invalid_response");
	const rows: unknown[] = value;
	return rows.map(parseSnapshot);
}

function parseCurrentNote(value: unknown): RecoveryCurrentNote {
	if (isRecord(value)) {
		if (value.kind === "missing") return { kind: "missing" };
		if (
			value.kind === "present" &&
			typeof value.text === "string" &&
			typeof value.etag === "string" &&
			/^[a-f0-9]{64}$/.test(value.etag)
		) {
			return { kind: "present", text: value.text, etag: value.etag };
		}
	}
	throw new Error("recovery_invalid_response");
}

export function parsePreview(value: unknown): RecoveryPreview {
	if (
		!isRecord(value) ||
		!isSnapshotId(value.id) ||
		typeof value.path !== "string" ||
		value.path.length === 0 ||
		typeof value.text !== "string"
	) {
		throw new Error("recovery_invalid_response");
	}
	return {
		id: value.id,
		path: value.path,
		text: value.text,
		current: parseCurrentNote(value.current),
	};
}
