import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface TOCHeading {
	id: string;
	level: number;
	text: string;
	pos: number;
}

function findScrollParent(el: HTMLElement): HTMLElement | null {
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

export function useTableOfContents(editor: Editor | null) {
	const [headings, setHeadings] = useState<TOCHeading[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const observerRef = useRef<IntersectionObserver | null>(null);

	const extractHeadings = useCallback(() => {
		if (!editor) {
			setHeadings([]);
			return;
		}
		const next: TOCHeading[] = [];
		editor.state.doc.descendants((node, pos) => {
			if (node.type.name === "heading") {
				const level = node.attrs.level as number;
				const text = node.textContent;
				if (text.trim()) {
					next.push({
						id: `toc-${pos}`,
						level,
						text,
						pos,
					});
				}
			}
		});
		setHeadings((prev) => {
			const same =
				prev.length === next.length &&
				prev.every(
					(h, i) =>
						h.pos === next[i].pos &&
						h.level === next[i].level &&
						h.text === next[i].text,
				);
			return same ? prev : next;
		});
	}, [editor]);

	useEffect(() => {
		if (!editor) return;
		extractHeadings();
		editor.on("update", extractHeadings);
		return () => {
			editor.off("update", extractHeadings);
		};
	}, [editor, extractHeadings]);

	useEffect(() => {
		if (!editor || headings.length === 0) {
			setActiveId(null);
			return;
		}

		const scrollContainer = findScrollParent(editor.view.dom as HTMLElement);
		if (!scrollContainer) return;

		observerRef.current?.disconnect();

		const visibleIds = new Set<string>();

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const id = entry.target.getAttribute("data-toc-id");
					if (!id) continue;
					if (entry.isIntersecting) {
						visibleIds.add(id);
					} else {
						visibleIds.delete(id);
					}
				}

				if (visibleIds.size > 0) {
					const first = headings.find((h) => visibleIds.has(h.id));
					if (first) setActiveId(first.id);
				} else {
					setActiveId(null);
				}
			},
			{
				root: scrollContainer,
				rootMargin: "0px 0px -70% 0px",
				threshold: 0,
			},
		);

		observerRef.current = observer;

		for (const heading of headings) {
			try {
				const dom = editor.view.nodeDOM(heading.pos);
				const el = dom instanceof HTMLElement ? dom : null;
				if (el) {
					el.setAttribute("data-toc-id", heading.id);
					observer.observe(el);
				}
			} catch {
				// pos may be stale after rapid edits
			}
		}

		return () => {
			observer.disconnect();
		};
	}, [editor, headings]);

	const scrollToHeading = useCallback(
		(heading: TOCHeading) => {
			if (!editor) return;
			editor.commands.expandHeadingAncestors(heading.pos);
			window.requestAnimationFrame(() => {
				let el: HTMLElement | null = null;
				try {
					const dom = editor.view.nodeDOM(heading.pos);
					el = dom instanceof HTMLElement ? dom : null;
				} catch {
					// pos may be stale
				}

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
