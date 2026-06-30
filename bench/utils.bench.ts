import { bench, describe } from "vitest";
import { normalizeInlineMarkdown } from "../src/lib/markdownUtils";
import {
	joinYamlFrontmatter,
	parseNotePreview,
	splitYamlFrontmatter,
} from "../src/lib/notePreview";
import {
	type RelationshipGroup,
	groupRelationshipsByField,
} from "../src/lib/relationships";
import type { NoteRelationship } from "../src/lib/tauri";
import { countWords, formatReadingTime } from "../src/lib/textStats";
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
	bench("countWords on a large document", () => {
		countWords(plainText);
	});

	bench("formatReadingTime", () => {
		formatReadingTime(1234);
	});
});

describe("markdownUtils", () => {
	bench("normalizeInlineMarkdown on rich markdown", () => {
		normalizeInlineMarkdown(noteBody);
	});
});

describe("notePreview", () => {
	bench("parseNotePreview with frontmatter", () => {
		parseNotePreview("notes/my-detailed-note.md", noteWithFrontmatter);
	});

	bench("splitYamlFrontmatter", () => {
		splitYamlFrontmatter(noteWithFrontmatter);
	});

	bench("joinYamlFrontmatter", () => {
		const { frontmatter, body } = splitYamlFrontmatter(noteWithFrontmatter);
		joinYamlFrontmatter(frontmatter, body);
	});
});

describe("relationships", () => {
	bench("groupRelationshipsByField on 500 relationships", () => {
		const grouped: RelationshipGroup[] =
			groupRelationshipsByField(relationships);
		void grouped;
	});
});

describe("path utils", () => {
	bench("normalizeRelPath over many paths", () => {
		for (const p of paths) normalizeRelPath(`\\${p}\\`);
	});

	bench("fileExtension over many paths", () => {
		for (const p of paths) fileExtension(p);
	});

	bench("isPreviewableNotePath over many paths", () => {
		for (const p of paths) isPreviewableNotePath(p);
	});

	bench("displayFolderFromPath over many paths", () => {
		for (const p of paths) displayFolderFromPath(p);
	});
});
