import type { Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export const CODE_BLOCK_PREVIEW_REFRESH_META = "code-block-preview-refresh";

let nextPreviewId = 1;
const enabledPreviewIdsByView = new WeakMap<EditorView, Map<number, string>>();

export function enableCodeBlockPreviewAt(
	view: EditorView,
	pos: number,
): string {
	let session = enabledPreviewIdsByView.get(view);
	if (!session) {
		session = new Map();
		enabledPreviewIdsByView.set(view, session);
	}
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

// Read helpers tolerate a missing view: plugin state can initialize before
// TipTap assigns editor.view.
function readPreviewSession(
	view: EditorView | undefined,
): Map<number, string> | undefined {
	return view ? enabledPreviewIdsByView.get(view) : undefined;
}

export function hasEnabledCodeBlockPreviews(
	view: EditorView | undefined,
): boolean {
	return (readPreviewSession(view)?.size ?? 0) > 0;
}

export function isCodeBlockPreviewEnabled(
	view: EditorView | undefined,
	pos: number,
): boolean {
	return readPreviewSession(view)?.has(pos) ?? false;
}

export function getCodeBlockPreviewId(
	view: EditorView | undefined,
	pos: number,
): string | null {
	return readPreviewSession(view)?.get(pos) ?? null;
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
