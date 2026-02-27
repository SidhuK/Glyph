import type { NoteProperty } from "../../../lib/tauri";

export function emptyProperty(): NoteProperty {
	return {
		key: "",
		kind: "text",
		value_text: "",
		value_bool: null,
		value_list: [],
	};
}

export function listText(property: NoteProperty): string {
	return property.value_list.join(", ");
}

export function fromListText(value: string): string[] {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

export function normalizeTagToken(value: string): string | null {
	const normalized = value
		.trim()
		.replace(/^#+/, "")
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9_/-]/g, "");
	return normalized || null;
}

export function formatTagLabel(tag: string): string {
	return tag.startsWith("#") ? tag : `#${tag}`;
}

export function displayValue(property: NoteProperty): string {
	if (property.kind === "checkbox") {
		return property.value_bool ? "True" : "False";
	}
	if (property.kind === "tags" || property.kind === "list") {
		return property.value_list.join(", ");
	}
	return property.value_text ?? "";
}

export function normalizeForKind(property: NoteProperty): NoteProperty {
	switch (property.kind) {
		case "checkbox":
			return {
				...property,
				value_bool:
					property.value_bool ??
					(property.value_text ?? "").trim().toLowerCase() === "true",
			};
		case "tags":
		case "list":
			return {
				...property,
				value_list:
					property.value_list.length > 0
						? property.value_list
						: fromListText(property.value_text ?? ""),
			};
		case "yaml":
			return {
				...property,
				value_text:
					property.value_text ??
					(property.value_list.length > 0
						? property.value_list.join(", ")
						: property.value_bool != null
							? String(property.value_bool)
							: ""),
			};
		default:
			return {
				...property,
				value_text:
					property.value_text ??
					(property.value_list.length > 0
						? property.value_list.join(", ")
						: property.value_bool != null
							? String(property.value_bool)
							: ""),
			};
	}
}

export function buildTagSuggestions(
	availableTags: Array<{ tag: string; count: number }>,
	selectedTags: string[],
	draft: string,
): Array<{ tag: string; count: number }> {
	const normalizedDraft = normalizeTagToken(draft);
	if (!normalizedDraft || normalizedDraft.length < 2) {
		return [];
	}
	const selectedTagSet = new Set(selectedTags);
	return availableTags
		.filter(
			({ tag }) => !selectedTagSet.has(tag) && tag.includes(normalizedDraft),
		)
		.slice(0, 8);
}
