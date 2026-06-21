// @vitest-environment jsdom

import type { Editor } from "@tiptap/react";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTableOfContents } from "./useTableOfContents";

(
	globalThis as typeof globalThis & {
		IS_REACT_ACT_ENVIRONMENT?: boolean;
	}
).IS_REACT_ACT_ENVIRONMENT = true;

interface HarnessProps {
	contentRoot: HTMLElement | null;
	editor: Editor;
}

function Harness({ contentRoot, editor }: HarnessProps) {
	const { activeId, headings } = useTableOfContents(editor, contentRoot);
	return (
		<output
			data-active-id={activeId ?? ""}
			data-heading-count={headings.length}
		/>
	);
}

describe("useTableOfContents editor mounting", () => {
	let container: HTMLDivElement;
	let root: Root;
	let viewAccessCount: number;
	let viewMounted: boolean;
	let editor: Editor;
	let editorContentRoot: HTMLDivElement;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
			window.setTimeout(() => callback(performance.now()), 16),
		);
		vi.stubGlobal("cancelAnimationFrame", (id: number) =>
			window.clearTimeout(id),
		);
		viewAccessCount = 0;
		viewMounted = false;

		const headingElement = document.createElement("h1");
		headingElement.textContent = "Heading";
		editorContentRoot = document.createElement("div");
		editorContentRoot.appendChild(headingElement);

		const headingNode = {
			attrs: { level: 1 },
			textContent: "Heading",
			type: { name: "heading" },
		};
		const listeners = new Map<string, Set<(event: unknown) => void>>();
		editor = {
			get view() {
				viewAccessCount += 1;
				if (!viewMounted) {
					throw new Error("The editor view is not mounted");
				}
				return {
					nodeDOM: () => headingElement,
				};
			},
			state: {
				doc: {
					descendants: (
						callback: (node: typeof headingNode, pos: number) => void,
					) => callback(headingNode, 0),
				},
			},
			on: (event: string, callback: (event: unknown) => void) => {
				if (!listeners.has(event)) listeners.set(event, new Set());
				listeners.get(event)?.add(callback);
			},
			off: (event: string, callback: (event: unknown) => void) => {
				listeners.get(event)?.delete(callback);
			},
			commands: {
				expandHeadingAncestors: vi.fn(),
			},
		} as unknown as Editor;

		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	async function flushAnimationFrame() {
		await act(async () => {
			await vi.advanceTimersByTimeAsync(16);
		});
	}

	it("does not ask TipTap for its view before the content root is mounted", async () => {
		act(() => root.render(<Harness contentRoot={null} editor={editor} />));
		await flushAnimationFrame();

		expect(container.querySelector("output")?.dataset.headingCount).toBe("1");
		expect(viewAccessCount).toBe(0);
	});

	it("starts DOM tracking when the mounted content root becomes available", async () => {
		act(() => root.render(<Harness contentRoot={null} editor={editor} />));
		await flushAnimationFrame();
		expect(viewAccessCount).toBe(0);

		viewMounted = true;
		const scrollContainer = document.createElement("div");
		scrollContainer.style.overflowY = "auto";
		scrollContainer.appendChild(editorContentRoot);
		document.body.appendChild(scrollContainer);

		act(() =>
			root.render(<Harness contentRoot={editorContentRoot} editor={editor} />),
		);
		await flushAnimationFrame();

		expect(viewAccessCount).toBeGreaterThan(0);
		scrollContainer.remove();
	});
});
