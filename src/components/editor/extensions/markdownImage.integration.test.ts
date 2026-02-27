import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { MarkdownImage } from "./markdownImage";

describe("MarkdownImage markdown manager integration", () => {
	it("parses image markdown into an image node and serializes back", () => {
		const manager = new MarkdownManager({
			extensions: [StarterKit, MarkdownImage],
		});

		const input = "Before ![Alt text](../assets/example.png) after";
		const json = manager.parse(input);
		const paragraph = json.content?.[0];
		const imageNode = paragraph?.content?.find((node) => node.type === "image");

		expect(imageNode?.type).toBe("image");
		expect(imageNode?.attrs?.src).toBe("../assets/example.png");
		expect(imageNode?.attrs?.alt).toBe("Alt text");

		const output = manager.serialize(json);
		expect(output).toContain("![Alt text](../assets/example.png)");
	});
});
