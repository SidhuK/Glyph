import { normalizeRelPath } from "../utils/path";

export interface TaskLineJump {
	path: string;
	byteOffset: number;
}

export const TASK_LINE_JUMP_EVENT = "glyph:task-line-jump";

const TASK_LINE_PATTERN = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]\[[^\]\n]\](?=[ \t]|$)/;
const BULLET_TASK_LINE_PATTERN = /^[ \t]*[-*+][ \t]\[[^\]\n]\](?=[ \t]|$)/;
const FENCE_PATTERN = /^[ \t]*(```|~~~)/;
const FRONTMATTER_DELIMITER = "---";

let pending: TaskLineJump | null = null;

export function requestTaskLineJump(jump: TaskLineJump): void {
	const path = normalizeRelPath(jump.path);
	if (!path || jump.byteOffset < 0) return;
	pending = { path, byteOffset: jump.byteOffset };
	window.dispatchEvent(new CustomEvent(TASK_LINE_JUMP_EVENT, { detail: pending }));
}

export function pendingTaskLineJump(path: string): TaskLineJump | null {
	return pending?.path === normalizeRelPath(path) ? pending : null;
}

export function discardTaskLineJump(jump: TaskLineJump): void {
	if (pending?.path === jump.path && pending.byteOffset === jump.byteOffset) pending = null;
}

function isTaskLineJump(value: unknown): value is TaskLineJump {
	return (
		typeof value === "object" &&
		value !== null &&
		"path" in value &&
		typeof value.path === "string" &&
		"byteOffset" in value &&
		typeof value.byteOffset === "number"
	);
}

export function taskLineJumpFromEvent(event: Event): TaskLineJump | null {
	if (!(event instanceof CustomEvent)) return null;
	const detail: unknown = event.detail;
	return isTaskLineJump(detail) ? detail : null;
}

export function charOffsetFromByteOffset(text: string, byteOffset: number): number {
	const bytes = new TextEncoder().encode(text);
	const bounded = Math.max(0, Math.min(byteOffset, bytes.length));
	return new TextDecoder().decode(bytes.slice(0, bounded)).length;
}

interface TaskLineOrdinals {
	any: number;
	bullet: number;
	anyTotal: number;
	bulletTotal: number;
}

function frontmatterEnd(lines: readonly string[]): number {
	if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) return 0;
	const close = lines.findIndex(
		(line, index) => index > 0 && line.trim() === FRONTMATTER_DELIMITER,
	);
	return close < 0 ? 0 : close + 1;
}

export function taskLineOrdinals(text: string, charOffset: number): TaskLineOrdinals {
	const lines = text.split("\n");
	const result: TaskLineOrdinals = { any: -1, bullet: -1, anyTotal: 0, bulletTotal: 0 };
	const bodyStart = frontmatterEnd(lines);
	let lineStart = 0;
	let inFence = false;
	lines.forEach((line, index) => {
		const isTarget = charOffset >= lineStart && charOffset <= lineStart + line.length;
		lineStart += line.length + 1;
		if (index < bodyStart) return;
		if (FENCE_PATTERN.test(line)) {
			inFence = !inFence;
			return;
		}
		if (inFence) return;
		const isBullet = BULLET_TASK_LINE_PATTERN.test(line);
		if (TASK_LINE_PATTERN.test(line)) {
			if (isTarget) result.any = result.anyTotal;
			result.anyTotal += 1;
		}
		if (isBullet) {
			if (isTarget) result.bullet = result.bulletTotal;
			result.bulletTotal += 1;
		}
	});
	return result;
}
