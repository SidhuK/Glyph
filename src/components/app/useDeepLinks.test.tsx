// @vitest-environment jsdom

import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlyphDeepLink } from "../../lib/deeplinks";
import { useDeepLinks } from "./useDeepLinks";

let currentUrls: string[] | null = null;
let openUrlHandler: ((urls: string[]) => void) | null = null;
const unlistenMock = vi.fn();

vi.mock("@tauri-apps/plugin-deep-link", () => ({
	getCurrent: vi.fn(() => Promise.resolve(currentUrls)),
	onOpenUrl: vi.fn((handler: (urls: string[]) => void) => {
		openUrlHandler = handler;
		return Promise.resolve(unlistenMock);
	}),
}));

(
	globalThis as typeof globalThis & {
		IS_REACT_ACT_ENVIRONMENT?: boolean;
	}
).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({
	settingsLoaded,
	spacePath,
	onOpenDeepLink,
	onError,
}: {
	settingsLoaded: boolean;
	spacePath: string | null;
	onOpenDeepLink: (link: GlyphDeepLink) => void;
	onError: (message: string) => void;
}) {
	useDeepLinks({
		settingsLoaded,
		spacePath,
		onOpenDeepLink,
		onError,
	});

	return null;
}

function flushPromises() {
	return new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe("useDeepLinks", () => {
	let container: HTMLDivElement;
	let root: Root;
	let openedLinks: GlyphDeepLink[];
	let errors: string[];
	let onOpenDeepLink: (link: GlyphDeepLink) => void;
	let onError: (message: string) => void;

	beforeEach(() => {
		currentUrls = null;
		openUrlHandler = null;
		unlistenMock.mockClear();
		openedLinks = [];
		errors = [];
		onOpenDeepLink = (link) => {
			openedLinks.push(link);
		};
		onError = (message) => {
			errors.push(message);
		};
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
	});

	it("opens startup deeplinks after settings and a space are ready", async () => {
		currentUrls = ["glyph://note/notes/Today.md"];

		await act(async () => {
			root.render(
				<Harness
					settingsLoaded={false}
					spacePath={null}
					onOpenDeepLink={onOpenDeepLink}
					onError={onError}
				/>,
			);
			await flushPromises();
		});

		expect(openedLinks).toEqual([]);

		await act(async () => {
			root.render(
				<Harness
					settingsLoaded
					spacePath="/tmp/space"
					onOpenDeepLink={onOpenDeepLink}
					onError={onError}
				/>,
			);
			await flushPromises();
		});

		expect(openedLinks).toEqual([
			{
				kind: "note",
				path: "notes/Today.md",
			},
		]);
		expect(errors).toEqual([]);
	});

	it("allows settings links without an open space", async () => {
		currentUrls = ["glyph://settings/ai"];

		await act(async () => {
			root.render(
				<Harness
					settingsLoaded
					spacePath={null}
					onOpenDeepLink={onOpenDeepLink}
					onError={onError}
				/>,
			);
			await flushPromises();
		});

		expect(openedLinks).toEqual([
			{
				kind: "settings",
				tab: "ai",
			},
		]);
		expect(errors).toEqual([]);
	});

	it("reports current-space links when startup finishes without a space", async () => {
		currentUrls = ["glyph://calendar"];

		await act(async () => {
			root.render(
				<Harness
					settingsLoaded
					spacePath={null}
					onOpenDeepLink={onOpenDeepLink}
					onError={onError}
				/>,
			);
			await flushPromises();
		});

		expect(openedLinks).toEqual([]);
		expect(errors).toEqual(["Open a space before using this Glyph link."]);
	});

	it("dedupes live URL events", async () => {
		await act(async () => {
			root.render(
				<Harness
					settingsLoaded
					spacePath="/tmp/space"
					onOpenDeepLink={onOpenDeepLink}
					onError={onError}
				/>,
			);
			await flushPromises();
		});

		await act(async () => {
			openUrlHandler?.(["glyph://all-docs", "glyph://all-docs"]);
			await flushPromises();
		});

		expect(openedLinks).toEqual([{ kind: "all-docs" }]);
	});
});
