import type { EditorEvents } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	type ChangedRange,
	changedRangesFromTransactions,
	mergeChangedRanges,
} from "../extensions/changedRanges";
import { withHeadingSlugs } from "../markdown/headingAnchor";

export interface TOCHeading {
	id: string;
	level: number;
	text: string;
	pos: number;
	slug?: string;
}

const HEADING_PREVIEW_MAX_LENGTH = 150;

export function getHeadingElement(
	editor: Editor,
	heading: TOCHeading,
): HTMLElement | null {
	try {
		const dom = editor.view.nodeDOM(heading.pos);
		return dom instanceof HTMLElement ? dom : null;
	} catch {
		return null;
	}
}

export function findScrollParent(el: HTMLElement): HTMLElement | null {
	let current = el.parentElement;
	while (current) {
		const style = getComputedStyle(current);
		if (
			style.overflowY === "auto" ||
			style.overflowY === "scroll" ||
			style.overflow === "auto" ||
			style.overflow === "scroll"
		) {
			return current;
		}
		current = current.parentElement;
	}
	return null;
}

export function isSameHeadingList(
	prev: readonly TOCHeading[],
	next: readonly TOCHeading[],
) {
	return (
		prev.length === next.length &&
		prev.every(
			(heading, index) =>
				heading.pos === next[index].pos &&
				heading.level === next[index].level &&
				heading.text === next[index].text,
		)
	);
}

function truncatePreview(text: string): string {
	if (text.length <= HEADING_PREVIEW_MAX_LENGTH) return text;
	return `${text.slice(0, HEADING_PREVIEW_MAX_LENGTH).trimEnd()}...`;
}

function normalizePreviewText(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

export function getHeadingPreview(
	doc: ProseMirrorNode,
	heading: TOCHeading,
	nextHeading: TOCHeading | undefined,
): string | null {
	const chunks: string[] = [];
	let previewLength = 0;
	const docEnd = doc.content.size;
	if (heading.pos < 0 || heading.pos >= docEnd) return null;
	const to = Math.min(
		Math.max(nextHeading?.pos ?? docEnd, heading.pos),
		docEnd,
	);
	if (heading.pos >= to) return null;

	doc.nodesBetween(heading.pos, to, (node) => {
		if (previewLength > HEADING_PREVIEW_MAX_LENGTH) return false;
		if (node.type.name === "heading") return false;
		if (!node.isTextblock) return;

		const text = normalizePreviewText(node.textContent);
		if (!text) return false;

		previewLength += text.length + (chunks.length > 0 ? 1 : 0);
		chunks.push(text);
		return false;
	});

	const preview = normalizePreviewText(chunks.join(" "));
	return preview ? truncatePreview(preview) : null;
}

function headingFromNode(
	node: ProseMirrorNode,
	pos: number,
): TOCHeading | null {
	if (node.type.name !== "heading") return null;
	const level = node.attrs.level as number;
	const text = node.textContent;
	if (!text.trim()) return null;
	return {
		id: `toc-${pos}`,
		level,
		text,
		pos,
	};
}

export function extractHeadingsFromDoc(doc: ProseMirrorNode): TOCHeading[] {
	const headings: TOCHeading[] = [];
	doc.descendants((node, pos) => {
		const heading = headingFromNode(node, pos);
		if (heading) headings.push(heading);
	});
	return withHeadingSlugs(headings);
}

function expandRangesToTextblocks(
	doc: ProseMirrorNode,
	ranges: readonly ChangedRange[],
): ChangedRange[] {
	const expanded: ChangedRange[] = [];
	for (const range of ranges) {
		const from = Math.max(0, range.from - 1);
		const to = Math.min(doc.content.size, range.to + 1);
		doc.nodesBetween(from, to, (node, pos) => {
			if (!node.isTextblock) return;
			expanded.push({ from: pos, to: pos + node.nodeSize });
			return false;
		});
	}
	return mergeChangedRanges(expanded.length ? expanded : ranges);
}

function extractHeadingsInRanges(
	doc: ProseMirrorNode,
	ranges: readonly ChangedRange[],
): TOCHeading[] {
	const headings: TOCHeading[] = [];
	const seen = new Set<number>();
	for (const range of ranges) {
		doc.nodesBetween(range.from, range.to, (node, pos) => {
			if (seen.has(pos)) return false;
			seen.add(pos);
			const heading = headingFromNode(node, pos);
			if (heading) headings.push(heading);
		});
	}
	return headings;
}

function rangesContainHeading(
	doc: ProseMirrorNode,
	ranges: readonly ChangedRange[],
): boolean {
	for (const range of ranges) {
		let containsHeading = false;
		doc.nodesBetween(range.from, range.to, (node) => {
			if (node.type.name === "heading") {
				containsHeading = true;
				return false;
			}
			return !containsHeading;
		});
		if (containsHeading) return true;
	}
	return false;
}

function rangeTouchesHeading(
	heading: TOCHeading,
	range: ChangedRange,
): boolean {
	return heading.pos >= range.from && heading.pos < range.to;
}

function mapHeadingsThroughTransaction(
	current: readonly TOCHeading[],
	transaction: Transaction,
): TOCHeading[] {
	return current
		.map((heading) => {
			const result = transaction.mapping.mapResult(heading.pos, -1);
			return result.deleted
				? null
				: { ...heading, id: `toc-${result.pos}`, pos: result.pos };
		})
		.filter((heading): heading is TOCHeading => heading !== null);
}

export function updateHeadingsFromTransaction(
	current: readonly TOCHeading[],
	transaction: Transaction,
): TOCHeading[] {
	const changedRanges = changedRangesFromTransactions(
		[transaction],
		transaction.doc.content.size,
	);
	if (!changedRanges.length) {
		return mapHeadingsThroughTransaction(current, transaction);
	}

	const scanRanges = expandRangesToTextblocks(transaction.doc, changedRanges);
	const mapped = mapHeadingsThroughTransaction(current, transaction);
	const touchedExistingHeading = mapped.some((heading) =>
		scanRanges.some((range) => rangeTouchesHeading(heading, range)),
	);
	const changedRangeHasHeading = rangesContainHeading(
		transaction.doc,
		scanRanges,
	);

	if (!touchedExistingHeading && !changedRangeHasHeading) {
		return mapped;
	}

	const changedHeadings = extractHeadingsInRanges(transaction.doc, scanRanges);
	const next = mapped.filter(
		(heading) =>
			!scanRanges.some((range) => rangeTouchesHeading(heading, range)),
	);
	next.push(...changedHeadings);
	next.sort((a, b) => a.pos - b.pos);
	return withHeadingSlugs(next);
}

export function useTableOfContents(
	editor: Editor | null,
	contentRoot: HTMLElement | null,
) {
	const [headings, setHeadings] = useState<TOCHeading[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const activeFrameRef = useRef<number | null>(null);
	const headingsRef = useRef<TOCHeading[]>([]);
	const headingsFrameRef = useRef<number | null>(null);
	const headingsEditorRef = useRef<Editor | null>(editor);

	if (headingsEditorRef.current !== editor) {
		headingsEditorRef.current = editor;
		const next = editor ? extractHeadingsFromDoc(editor.state.doc) : [];
		headingsRef.current = next;
		setHeadings((prev) => (isSameHeadingList(prev, next) ? prev : next));
		if (!editor) setActiveId(null);
	}

	const publishHeadings = useCallback(() => {
		if (headingsFrameRef.current !== null) return;
		headingsFrameRef.current = window.requestAnimationFrame(() => {
			headingsFrameRef.current = null;
			const next = headingsRef.current;
			setHeadings((prev) => (isSameHeadingList(prev, next) ? prev : next));
		});
	}, []);

	useEffect(() => {
		if (!editor) {
			headingsRef.current = [];
			setHeadings([]);
			return;
		}
		headingsRef.current = extractHeadingsFromDoc(editor.state.doc);
		publishHeadings();
		const updateHeadings = ({
			transaction,
			appendedTransactions,
		}: EditorEvents["transaction"]) => {
			const documentTransactions = [
				transaction,
				...appendedTransactions,
			].filter((item) => item.docChanged);
			if (documentTransactions.length === 0) return;
			for (const documentTransaction of documentTransactions) {
				headingsRef.current = updateHeadingsFromTransaction(
					headingsRef.current,
					documentTransaction,
				);
			}
			publishHeadings();
		};
		editor.on("transaction", updateHeadings);
		return () => {
			editor.off("transaction", updateHeadings);
			if (headingsFrameRef.current !== null) {
				window.cancelAnimationFrame(headingsFrameRef.current);
				headingsFrameRef.current = null;
			}
		};
	}, [editor, publishHeadings]);

	useEffect(() => {
		if (!editor || !contentRoot || headings.length === 0) {
			setActiveId(null);
			return;
		}

		const scrollContainer = findScrollParent(contentRoot);
		if (!scrollContainer) {
			setActiveId(headings[0]?.id ?? null);
			return;
		}

		const updateActiveHeading = () => {
			activeFrameRef.current = null;
			const containerRect = scrollContainer.getBoundingClientRect();
			const activationY =
				containerRect.top + Math.min(120, containerRect.height * 0.28);
			let nextActiveId: string | null = null;

			for (const heading of headings) {
				const el = getHeadingElement(editor, heading);
				if (!el) continue;
				const rect = el.getBoundingClientRect();
				if (el.offsetParent === null || rect.width === 0 || rect.height === 0) {
					continue;
				}
				if (rect.top > activationY) break;
				nextActiveId = heading.id;
			}

			setActiveId((prev) => (prev === nextActiveId ? prev : nextActiveId));
		};

		const requestActiveUpdate = () => {
			if (activeFrameRef.current !== null) return;
			activeFrameRef.current =
				window.requestAnimationFrame(updateActiveHeading);
		};

		requestActiveUpdate();
		scrollContainer.addEventListener("scroll", requestActiveUpdate, {
			passive: true,
		});
		window.addEventListener("resize", requestActiveUpdate);

		return () => {
			scrollContainer.removeEventListener("scroll", requestActiveUpdate);
			window.removeEventListener("resize", requestActiveUpdate);
			if (activeFrameRef.current !== null) {
				window.cancelAnimationFrame(activeFrameRef.current);
				activeFrameRef.current = null;
			}
		};
	}, [contentRoot, editor, headings]);

	const scrollToHeading = useCallback(
		(heading: TOCHeading) => {
			if (!editor) return;
			scrollEditorToHeading(editor, heading, () => setActiveId(heading.id));
		},
		[editor],
	);

	const getPreviewForHeading = useCallback(
		(heading: TOCHeading) => {
			if (!editor) return null;
			const headingIndex = headingsRef.current.findIndex(
				(item) => item.id === heading.id,
			);
			if (headingIndex === -1) return null;
			const currentHeading = headingsRef.current[headingIndex];
			if (!currentHeading) return null;
			const nextHeading = headingsRef.current[headingIndex + 1];
			return getHeadingPreview(editor.state.doc, currentHeading, nextHeading);
		},
		[editor],
	);

	return { headings, activeId, scrollToHeading, getPreviewForHeading };
}

export function scrollEditorToHeading(
	editor: Editor,
	heading: TOCHeading,
	onVisible?: () => void,
): void {
	editor.commands.expandHeadingAncestors(heading.pos);
	window.requestAnimationFrame(() => {
		const el = getHeadingElement(editor, heading);
		if (!el) return;
		onVisible?.();
		const scrollContainer = findScrollParent(el);
		if (scrollContainer) {
			const containerRect = scrollContainer.getBoundingClientRect();
			const elRect = el.getBoundingClientRect();
			const offset =
				elRect.top - containerRect.top + scrollContainer.scrollTop - 20;
			scrollContainer.scrollTo({ top: offset, behavior: "smooth" });
			return;
		}
		el.scrollIntoView({ behavior: "smooth", block: "start" });
	});
}
