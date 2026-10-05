import { test, describe } from "vite-plus/test";
import { normalizeInlineMarkdown } from "../src/lib/markdownUtils";
import {
	joinYamlFrontmatter,
	parseNotePreview,
	splitYamlFrontmatter,
} from "../src/lib/notePreview";
import { type RelationshipGroup, groupRelationshipsByField } from "../src/lib/relationships";
import type { NoteRelationship } from "../src/lib/tauri";
import { countWords } from "../src/lib/textStats";
import {
	displayFolderFromPath,
	fileExtension,
	isPreviewableNotePath,
	normalizeRelPath,
} from "../src/utils/path";

// A realistic note document with frontmatter, headings and rich inline markdown.
const paragraph = [
	"This is a **bold** statement with _emphasis_, some `inline code`,",
	"a [hyperlink](https://example.com/path?query=1), an ![image](img/diagram.png),",
	"a [[wiki link|Wiki Label]] and ~~struck~~ text repeated for realism.",
].join(" ");

const noteBody = Array.from({ length: 60 }, (_, i) => {
	if (i % 6 === 0) return `## Section ${i / 6}`;
	return paragraph;
}).join("\n\n");

const noteWithFrontmatter = `---\ntitle: "My Detailed Note"\ntags: [work, research]\ncreated: 2024-01-01\n---\n\n# Heading\n\n${noteBody}`;

const plainText = `${noteBody}\n\n${noteBody}`;

const relationships: NoteRelationship[] = Array.from(
	{ length: 500 },
	(_, i) =>
		({
			field_key: `field_${i % 12}`,
			ordinal: (i * 7) % 500,
			target_title: `Target ${i}`,
			to_title: `To ${i}`,
			to_id: `id-${i}`,
		}) as unknown as NoteRelationship,
);

const paths = Array.from(
	{ length: 200 },
	(_, i) => `notes/sub${i % 10}/deep/folder/document-${i}.md`,
);

describe("textStats", () => {
	test("countWords on a large document", async ({ bench }) => {
		await bench("countWords on a large document", () => {
			countWords(plainText);
		}).run();
	});
});

describe("markdownUtils", () => {
	test("normalizeInlineMarkdown on rich markdown", async ({ bench }) => {
		await bench("normalizeInlineMarkdown on rich markdown", () => {
			normalizeInlineMarkdown(noteBody);
		}).run();
	});
});

describe("notePreview", () => {
	test("parseNotePreview with frontmatter", async ({ bench }) => {
		await bench("parseNotePreview with frontmatter", () => {
			parseNotePreview("notes/my-detailed-note.md", noteWithFrontmatter);
		}).run();
	});

	test("splitYamlFrontmatter", async ({ bench }) => {
		await bench("splitYamlFrontmatter", () => {
			splitYamlFrontmatter(noteWithFrontmatter);
		}).run();
	});

	test("joinYamlFrontmatter", async ({ bench }) => {
		await bench("joinYamlFrontmatter", () => {
			const { frontmatter, body } = splitYamlFrontmatter(noteWithFrontmatter);
			joinYamlFrontmatter(frontmatter, body);
		}).run();
	});
});

describe("relationships", () => {
	test("groupRelationshipsByField on 500 relationships", async ({ bench }) => {
		await bench("groupRelationshipsByField on 500 relationships", () => {
			const grouped: RelationshipGroup[] = groupRelationshipsByField(relationships);
			void grouped;
		}).run();
	});
});

describe("path utils", () => {
	test("normalizeRelPath over many paths", async ({ bench }) => {
		await bench("normalizeRelPath over many paths", () => {
			for (const p of paths) normalizeRelPath(`\\${p}\\`);
		}).run();
	});

	test("fileExtension over many paths", async ({ bench }) => {
		await bench("fileExtension over many paths", () => {
			for (const p of paths) fileExtension(p);
		}).run();
	});

	test("isPreviewableNotePath over many paths", async ({ bench }) => {
		await bench("isPreviewableNotePath over many paths", () => {
			for (const p of paths) isPreviewableNotePath(p);
		}).run();
	});

	test("displayFolderFromPath over many paths", async ({ bench }) => {
		await bench("displayFolderFromPath over many paths", () => {
			for (const p of paths) displayFolderFromPath(p);
		}).run();
	});
});
