import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface TOCHeading {
	id: string;
	level: number;
	text: string;
	pos: number;
}

function getHeadingElement(
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
	const activeFrameRef = useRef<number | null>(null);

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
	}, [editor, headings]);

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
