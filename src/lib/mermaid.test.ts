// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
	extractMermaidErrorMessage,
	isMermaidCodeBlockLanguage,
} from "./mermaid";

describe("mermaid helpers", () => {
	it("detects Mermaid code block languages case-insensitively", () => {
		expect(isMermaidCodeBlockLanguage("Mermaid")).toBe(true);
		expect(isMermaidCodeBlockLanguage(" mermaid ")).toBe(true);
		expect(isMermaidCodeBlockLanguage("typescript")).toBe(false);
	});

	it("extracts user-facing Mermaid render errors", () => {
		expect(extractMermaidErrorMessage(new Error(" Bad syntax "))).toBe(
			"Bad syntax",
		);
		expect(extractMermaidErrorMessage(" Parse failed ")).toBe("Parse failed");
		expect(extractMermaidErrorMessage(null)).toBe(
			"Unable to render Mermaid diagram.",
		);
	});
});
