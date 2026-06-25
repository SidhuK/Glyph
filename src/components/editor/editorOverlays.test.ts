// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { isEditorOverlayOpen } from "./editorOverlays";

describe("isEditorOverlayOpen", () => {
	it("returns false when no editor overlays are mounted", () => {
		expect(isEditorOverlayOpen()).toBe(false);
	});

	it("detects an open slash command menu", () => {
		const menu = document.createElement("div");
		menu.className = "slashCommandMenu";
		document.body.append(menu);
		expect(isEditorOverlayOpen()).toBe(true);
		menu.remove();
	});

	it("detects an open radix menu", () => {
		const menu = document.createElement("div");
		menu.setAttribute("role", "menu");
		menu.setAttribute("data-state", "open");
		document.body.append(menu);
		expect(isEditorOverlayOpen()).toBe(true);
		menu.remove();
	});

	it("detects an open wiki link suggestion menu", () => {
		const menu = document.createElement("div");
		menu.className = "wikiLinkSuggestionMenu";
		document.body.append(menu);
		expect(isEditorOverlayOpen()).toBe(true);
		menu.remove();
	});
});
