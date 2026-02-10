import { describe, expect, it } from "vitest";
import {
	findWikiLinkSpans,
	parseWikiLink,
	wikiLinkAttrsToMarkdown,
} from "./wikiLinkCodec";

describe("wikiLinkCodec", () => {
	it("parses basic and aliased wikilinks", () => {
		expect(parseWikiLink("[[Daily Note]]")?.target).toBe("Daily Note");
		expect(parseWikiLink("[[Daily Note|Today]]")?.alias).toBe("Today");
	});

	it("parses heading and block anchors", () => {
		expect(parseWikiLink("[[Note#Section]]")).toMatchObject({
			target: "Note",
			anchorKind: "heading",
			anchor: "Section",
		});
		expect(parseWikiLink("[[Note#^abc123]]")).toMatchObject({
			target: "Note",
			anchorKind: "block",
			anchor: "abc123",
		});
	});

	it("rejects malformed wikilinks", () => {
		expect(parseWikiLink("[[No end")).toBeNull();
		expect(parseWikiLink("[[]]")).toBeNull();
		expect(parseWikiLink("[[#Heading]]")).toBeNull();
	});

	it("serializes attrs back to wikilink markdown", () => {
		expect(
			wikiLinkAttrsToMarkdown({
				target: "Note",
				alias: "Alias",
				anchorKind: "none",
				anchor: null,
			}),
		).toBe("[[Note|Alias]]");
		expect(
			wikiLinkAttrsToMarkdown({
				target: "Note",
				alias: null,
				anchorKind: "block",
				anchor: "x1",
			}),
		).toBe("[[Note#^x1]]");
	});

	it("falls back to raw when attrs are incomplete", () => {
		expect(
			wikiLinkAttrsToMarkdown({
				raw: "[[Broken#]]",
				target: "Broken",
				anchorKind: "heading",
				anchor: null,
			}),
		).toBe("[[Broken#]]");
	});

	it("finds all wikilink spans in text", () => {
		const spans = findWikiLinkSpans("A [[One]] and [[Two|2]]");
		expect(spans).toHaveLength(2);
		expect(spans[0]?.raw).toBe("[[One]]");
		expect(spans[1]?.raw).toBe("[[Two|2]]");
	});
});
