import type { Shortcut } from "../../lib/shortcuts";
import type { SearchAdvancedRequest } from "../../lib/tauri";
import { springPresets } from "../ui/animations";

export interface Command {
	id: string;
	label: string;
	category?: string;
	shortcut?: Shortcut;
	action: () => void | Promise<void>;
	enabled?: boolean;
}

export type Tab = "commands" | "search";

export const TABS: { id: Tab; label: string }[] = [
	{ id: "commands", label: "Commands" },
	{ id: "search", label: "Search" },
];

export const springTransition = springPresets.snappy;

export interface ParsedSearchQuery {
	request: SearchAdvancedRequest;
	text: string;
}

function tokenize(raw: string): string[] {
	return raw.match(/"[^"]*"|\S+/g) ?? [];
}

function unquote(value: string): string {
	const trimmed = value.trim();
	if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

export function parseSearchQuery(raw: string): ParsedSearchQuery {
	const tokens = tokenize(raw.trim());
	const request: SearchAdvancedRequest = {
		tags: [],
		title_only: false,
		tag_only: false,
	};
	const textParts: string[] = [];

	for (const token of tokens) {
		const lower = token.toLowerCase();
		if (lower === "title:only") {
			request.title_only = true;
			continue;
		}
		if (lower === "tag:only") {
			request.tag_only = true;
			continue;
		}
		if (token.startsWith("#")) {
			request.tags?.push(token);
			continue;
		}
		if (lower.startsWith("tag:")) {
			const rest = unquote(token.slice(4));
			if (rest) request.tags?.push(rest.startsWith("#") ? rest : `#${rest}`);
			continue;
		}
		textParts.push(unquote(token));
	}

	const text = textParts.join(" ").trim();
	request.query = text || null;
	return { request, text };
}

function quoteIfNeeded(v: string): string {
	return /\s/.test(v) ? `"${v}"` : v;
}

export function buildSearchQuery(request: SearchAdvancedRequest): string {
	const parts: string[] = [];
	for (const tag of request.tags ?? [])
		parts.push(tag.startsWith("#") ? tag : `#${tag}`);
	if (request.tag_only) parts.push("tag:only");
	if (request.title_only) parts.push("title:only");
	if (request.query?.trim()) parts.push(quoteIfNeeded(request.query.trim()));
	return parts.join(" ").trim();
}
