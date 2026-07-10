import type { NoteProperty, TagCount } from "../../../lib/tauri";

/** Keep in sync with `TAG_SEGMENT_PATTERN` / `INLINE_TAG_PATTERN` in `src-tauri/src/index/tags.rs`. */
const TAG_SEGMENT_PATTERN = /^[\p{L}\p{N}_][\p{L}\p{M}\p{N}_-]*$/u;

/** Inline `#tag` matcher shared by rich and raw editor decorations. */
export const INLINE_TAG_PATTERN =
	/(^|[^\p{L}\p{M}\p{N}_/#])#([\p{L}\p{N}_][\p{L}\p{M}\p{N}_/-]*)/gu;

export function humanizePropertyKey(key: string): string {
	if (!key) return "";
	return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function tagHueFromName(name: string): number {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	}
	return Math.abs(hash) % 360;
}

export function formatPropertyDate(value: string): string {
	if (!value) return "";
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return value;
	return parsed.toLocaleDateString(undefined, {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

export function emptyProperty(): NoteProperty {
	return {
		key: "",
		kind: "text",
		value_text: "",
		value_bool: null,
		value_list: [],
	};
}

function fromDelimitedText(value: string): string[] {
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
		.replace(/[^\p{L}\p{M}\p{N}_/-]/gu, "");
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
	return segments.every((segment) => TAG_SEGMENT_PATTERN.test(segment))
		? normalized
		: null;
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
			return {
				...property,
				value_list:
					property.value_list.length > 0
						? property.value_list
						: fromDelimitedText(property.value_text ?? ""),
			};
		case "status":
			return {
				...property,
				value_text:
					property.value_text?.trim() ||
					(property.value_list.length > 0 ? property.value_list[0] : "") ||
					"Not started",
				value_bool: null,
				value_list: [],
			};
		case "priority":
			return {
				...property,
				value_text:
					property.value_text?.trim() ||
					(property.value_list.length > 0 ? property.value_list[0] : "") ||
					"No",
				value_bool: null,
				value_list: [],
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
	limit = 8,
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
		.slice(0, limit);
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
