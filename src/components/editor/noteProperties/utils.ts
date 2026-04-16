import type { NoteProperty, TagCount } from "../../../lib/tauri";

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

function sanitizeTagText(value: string): string {
	return value
		.trim()
		.replace(/^#+/, "")
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9_/-]/g, "");
}

export function normalizeTagToken(value: string): string | null {
	const normalized = sanitizeTagText(value);
	if (
		!normalized ||
		normalized.startsWith("/") ||
		normalized.endsWith("/") ||
		normalized.includes("//")
	) {
		return null;
	}
	const segments = normalized.split("/");
	return segments.every(Boolean) ? normalized : null;
}

export function normalizeTagDraftPrefix(value: string): string {
	const normalized = sanitizeTagText(value);
	if (!normalized || normalized.startsWith("/")) {
		return "";
	}
	return normalized;
}

export function formatTagLabel(tag: string): string {
	return tag.startsWith("#") ? tag : `#${tag}`;
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
	availableTags: TagCount[],
	selectedTags: string[],
	draft: string,
): Array<{ tag: string; count: number }> {
	const normalizedDraft = normalizeTagDraftPrefix(draft);
	if (!normalizedDraft || normalizedDraft.length < 2) {
		return [];
	}
	const selectedTagSet = new Set(
		selectedTags
			.map((tag) => normalizeTagToken(tag))
			.filter((tag): tag is string => Boolean(tag)),
	);
	const descendantPrefix = normalizedDraft.endsWith("/")
		? normalizedDraft
		: `${normalizedDraft}/`;
	return availableTags
		.filter(
			({ tag, is_explicit }) =>
				is_explicit &&
				!selectedTagSet.has(tag) &&
				(tag.startsWith(normalizedDraft) || tag.includes(normalizedDraft)),
		)
		.sort((left, right) => {
			const leftRank = rankSuggestion(
				left.tag,
				normalizedDraft,
				descendantPrefix,
			);
			const rightRank = rankSuggestion(
				right.tag,
				normalizedDraft,
				descendantPrefix,
			);
			if (leftRank !== rightRank) {
				return leftRank - rightRank;
			}
			return left.tag.localeCompare(right.tag);
		})
		.map(({ tag, direct_count }) => ({ tag, count: direct_count }))
		.slice(0, 8);
}

function rankSuggestion(
	tag: string,
	normalizedDraft: string,
	descendantPrefix: string,
): number {
	if (tag === normalizedDraft) {
		return 0;
	}
	if (tag.startsWith(descendantPrefix)) {
		return 1;
	}
	if (tag.startsWith(normalizedDraft)) {
		return 2;
	}
	return 3;
}
