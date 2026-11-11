import {
	FileImage,
	File as FileIcon,
	HeadingIcon,
	NoteIcon,
	Pdf01Icon,
	PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { i18n } from "../../../i18n";
import { type EditorLinkSuggestion, isImageTarget } from "../../../lib/linkSuggestions";
import { isMarkdownPath, isPdfPath, parentDir } from "../../../utils/path";
import { splitWikiLinkQuery } from "../markdown/wikiLinkCodec";
import type { MenuRowContent } from "../slash/renderSlashMenuItem";

/** A link suggestion, or the last row that links the typed name as a new note. */
export type WikiLinkMenuItem = EditorLinkSuggestion | { kind: "create"; query: string };

function fileIcon(path: string) {
	if (isMarkdownPath(path)) return NoteIcon;
	if (isImageTarget(path)) return FileImage;
	if (isPdfPath(path)) return Pdf01Icon;
	return FileIcon;
}

function noteName(path: string): string {
	return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/** The name a `[[` query links to: the text before any `#heading` or `|alias`. */
function linkedName(query: string): string {
	return splitWikiLinkQuery(query).target.split("|", 1)[0]?.trim() ?? "";
}

function comparableLinkName(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/\.(?:md|markdown)$/, "");
}

/** Icon, title with the typed text in bold, and the folder (or the note, for a heading). */
export function linkSuggestionRow(item: EditorLinkSuggestion, query: string): MenuRowContent {
	if (item.kind === "heading") {
		const parsed = splitWikiLinkQuery(query);
		const match = parsed.kind === "heading" ? parsed.headingQuery : "";
		return { icon: HeadingIcon, title: item.title, match, hint: noteName(item.path) };
	}
	return {
		icon: fileIcon(item.path),
		title: item.title,
		match: linkedName(query),
		hint: parentDir(item.path),
	};
}

export function wikiLinkMenuRow(item: WikiLinkMenuItem, query: string): MenuRowContent {
	if (item.kind !== "create") return linkSuggestionRow(item, query);
	return {
		icon: PlusSignIcon,
		title: i18n.t("editor:linkSuggest.create", { name: linkedName(item.query) }),
	};
}

/**
 * Ends the list with a Create row for a plain note name nothing matches exactly. The link it
 * inserts is unresolved until followed, which creates the note.
 */
export function withCreateRow(
	items: EditorLinkSuggestion[],
	query: string,
	asEmbed: boolean,
): WikiLinkMenuItem[] {
	const name = comparableLinkName(linkedName(query));
	if (asEmbed || !name || splitWikiLinkQuery(query).kind !== "file") return items;
	// A typed `Plan.md` or `Folder/Plan` names an existing note as much as `Plan` does.
	const exists = items.some(
		(item) =>
			item.kind === "file" &&
			[item.title, item.insertText, item.path].some(
				(candidate) => comparableLinkName(candidate) === name,
			),
	);
	return exists ? items : [...items, { kind: "create", query }];
}
