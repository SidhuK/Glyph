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
		doc.nodesBetween(range.from, range.to, (node, pos) => {
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

function rangeTouchesHeading(
	heading: TOCHeading,
	range: ChangedRange,
): boolean {
	return heading.pos >= range.from && heading.pos <= range.to;
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
		return current
			.map((heading) => {
				const result = transaction.mapping.mapResult(heading.pos, -1);
				return result.deleted
					? null
					: { ...heading, id: `toc-${result.pos}`, pos: result.pos };
			})
			.filter((heading): heading is TOCHeading => heading !== null);
	}

	const scanRanges = expandRangesToTextblocks(transaction.doc, changedRanges);
	const next = current
		.map((heading) => {
			const result = transaction.mapping.mapResult(heading.pos, -1);
			return result.deleted
				? null
				: { ...heading, id: `toc-${result.pos}`, pos: result.pos };
		})
		.filter(
			(heading): heading is TOCHeading =>
				heading !== null &&
				!scanRanges.some((range) => rangeTouchesHeading(heading, range)),
		);

	next.push(...extractHeadingsInRanges(transaction.doc, scanRanges));
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
		}: {
			transaction: Transaction;
		}) => {
			if (!transaction.docChanged) return;
			headingsRef.current = updateHeadingsFromTransaction(
				headingsRef.current,
				transaction,
			);
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
			editor.commands.expandHeadingAncestors(heading.pos);
			window.requestAnimationFrame(() => {
				const el = getHeadingElement(editor, heading);
				if (!el) return;
				const scrollContainer = findScrollParent(el);
				if (scrollContainer) {
					const containerRect = scrollContainer.getBoundingClientRect();
					const elRect = el.getBoundingClientRect();
					const offset =
						elRect.top - containerRect.top + scrollContainer.scrollTop - 20;
					scrollContainer.scrollTo({ top: offset, behavior: "smooth" });
				} else {
					el.scrollIntoView({ behavior: "smooth", block: "start" });
				}
				setActiveId(heading.id);
			});
		},
		[editor],
	);

	return { headings, activeId, scrollToHeading };
}
