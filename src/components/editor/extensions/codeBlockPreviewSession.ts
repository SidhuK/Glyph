import type { Transaction } from "@tiptap/pm/state";

export const CODE_BLOCK_PREVIEW_REFRESH_META = "code-block-preview-refresh";

let nextPreviewId = 1;
const enabledPreviewIdsByPos = new Map<number, string>();

export function enableCodeBlockPreviewAt(pos: number): string {
	const existing = enabledPreviewIdsByPos.get(pos);
	if (existing) return existing;

	const id = `cb-preview-${nextPreviewId}`;
	nextPreviewId += 1;
	enabledPreviewIdsByPos.set(pos, id);
	return id;
}

export function clearCodeBlockPreviews(): void {
	enabledPreviewIdsByPos.clear();
}

export function hasEnabledCodeBlockPreviews(): boolean {
	return enabledPreviewIdsByPos.size > 0;
}

export function isCodeBlockPreviewEnabled(pos: number): boolean {
	return enabledPreviewIdsByPos.has(pos);
}

export function getCodeBlockPreviewId(pos: number): string | null {
	return enabledPreviewIdsByPos.get(pos) ?? null;
}

export function remapCodeBlockPreviews(transaction: Transaction): void {
	if (!transaction.docChanged || enabledPreviewIdsByPos.size === 0) return;

	const next = new Map<number, string>();
	for (const [pos, id] of enabledPreviewIdsByPos) {
		const mapped = transaction.mapping.mapResult(pos);
		if (!mapped.deleted) next.set(mapped.pos, id);
	}
	enabledPreviewIdsByPos.clear();
	for (const [pos, id] of next) {
		enabledPreviewIdsByPos.set(pos, id);
	}
}

export function isCodeBlockPreviewRefresh(transaction: Transaction): boolean {
	return transaction.getMeta(CODE_BLOCK_PREVIEW_REFRESH_META) === true;
}

export function hashPreviewSource(source: string): string {
	let hash = 5381;
	for (let index = 0; index < source.length; index += 1) {
		hash = (hash * 33) ^ source.charCodeAt(index);
	}
	return (hash >>> 0).toString(36);
}
