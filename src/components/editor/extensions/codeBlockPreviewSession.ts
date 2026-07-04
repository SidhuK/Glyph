import type { Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export const CODE_BLOCK_PREVIEW_REFRESH_META = "code-block-preview-refresh";

let nextPreviewId = 1;
const enabledPreviewIdsByView = new WeakMap<EditorView, Map<number, string>>();

function getPreviewSession(view: EditorView): Map<number, string> {
	let session = enabledPreviewIdsByView.get(view);
	if (!session) {
		session = new Map();
		enabledPreviewIdsByView.set(view, session);
	}
	return session;
}

export function enableCodeBlockPreviewAt(
	view: EditorView,
	pos: number,
): string {
	const session = getPreviewSession(view);
	const existing = session.get(pos);
	if (existing) return existing;

	const id = `cb-preview-${nextPreviewId}`;
	nextPreviewId += 1;
	session.set(pos, id);
	return id;
}

export function clearCodeBlockPreviews(view: EditorView): void {
	enabledPreviewIdsByView.delete(view);
}

export function hasEnabledCodeBlockPreviews(view: EditorView): boolean {
	return getPreviewSession(view).size > 0;
}

export function isCodeBlockPreviewEnabled(
	view: EditorView,
	pos: number,
): boolean {
	return getPreviewSession(view).has(pos);
}

export function getCodeBlockPreviewId(
	view: EditorView,
	pos: number,
): string | null {
	return getPreviewSession(view).get(pos) ?? null;
}

const remappedPreviewTransactions = new WeakSet<Transaction>();

export function remapCodeBlockPreviews(
	view: EditorView,
	transaction: Transaction,
): void {
	if (remappedPreviewTransactions.has(transaction)) return;
	remappedPreviewTransactions.add(transaction);

	const session = enabledPreviewIdsByView.get(view);
	if (!transaction.docChanged || !session || session.size === 0) return;

	const next = new Map<number, string>();
	for (const [pos, id] of session) {
		const mapped = transaction.mapping.mapResult(pos);
		if (!mapped.deleted) next.set(mapped.pos, id);
	}
	session.clear();
	for (const [pos, id] of next) {
		session.set(pos, id);
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
