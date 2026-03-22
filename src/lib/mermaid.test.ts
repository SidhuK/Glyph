// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mermaidMock = vi.hoisted(() => ({
	initialize: vi.fn(),
	parse: vi.fn(),
	render: vi.fn(),
}));

vi.mock("mermaid", () => ({
	default: mermaidMock,
}));

describe("mermaid helpers", () => {
	beforeEach(() => {
		document.documentElement.removeAttribute("data-theme");
		document.body.innerHTML = "";
		mermaidMock.initialize.mockReset();
		mermaidMock.parse.mockReset();
		mermaidMock.render.mockReset();
		mermaidMock.parse.mockResolvedValue(undefined);
		mermaidMock.render.mockResolvedValue({ svg: "<svg><g /></svg>" });
	});

	afterEach(() => {
		vi.resetModules();
	});

	it("detects the current app theme from the root element", async () => {
		document.documentElement.setAttribute("data-theme", "dark");
		const { getMermaidTheme, isMermaidCodeBlockLanguage } = await import(
			"./mermaid"
		);

		expect(getMermaidTheme()).toBe("dark");
		expect(isMermaidCodeBlockLanguage("Mermaid")).toBe(true);
		expect(isMermaidCodeBlockLanguage("typescript")).toBe(false);
	});

	it("initializes Mermaid with strict security and renders SVG output", async () => {
		const { renderMermaidDiagram } = await import("./mermaid");

		const svg = await renderMermaidDiagram(
			"flowchart TD\n  A[Start] --> B[End]",
		);

		expect(svg).toContain("<svg");
		expect(mermaidMock.initialize).toHaveBeenCalledWith(
			expect.objectContaining({
				startOnLoad: false,
				securityLevel: "strict",
				theme: "default",
			}),
		);
		expect(mermaidMock.parse).toHaveBeenCalledWith(
			"flowchart TD\n  A[Start] --> B[End]",
		);
		expect(mermaidMock.render).toHaveBeenCalledTimes(1);
	});

	it("reinitializes when the app theme changes", async () => {
		const { renderMermaidDiagram } = await import("./mermaid");

		await renderMermaidDiagram("flowchart TD\nA --> B");
		document.documentElement.setAttribute("data-theme", "dark");
		await renderMermaidDiagram("flowchart TD\nA --> B");

		expect(mermaidMock.initialize).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ theme: "default" }),
		);
		expect(mermaidMock.initialize).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ theme: "dark" }),
		);
	});

	it("rejects empty Mermaid source before calling the renderer", async () => {
		const { renderMermaidDiagram } = await import("./mermaid");

		await expect(renderMermaidDiagram("   ")).rejects.toThrow(
			"Add Mermaid source to preview this diagram.",
		);
		expect(mermaidMock.parse).not.toHaveBeenCalled();
		expect(mermaidMock.render).not.toHaveBeenCalled();
	});
});
