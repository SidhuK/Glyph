import type { ReactNode } from "react";
import type { Shortcut } from "../../lib/shortcuts";
import type { SearchAdvancedRequest } from "../../lib/tauri";
import type { PaletteResult, PaletteResultKind } from "./paletteResults";

export interface Command {
	id: string;
	label?: string;
	/** When set, resolveCommandShortcuts translates this key instead of commands:{id}.label */
	labelKey?: string;
	icon?: ReactNode;
	category?: string;
	searchTerms?: readonly string[];
	shortcut?: Shortcut;
	action: () => void | Promise<void>;
	enabled?: boolean;
	allowInEditable?: boolean;
	hideWhenQueryEmpty?: boolean;
}

export type PaletteLaunchMode = "commands" | "search";

export type PaletteQueryScope =
	| "all"
	| "commands"
	| "settings"
	| "folders"
	| "tags"
	| "people"
	| "templates";

export interface ParsedPaletteQuery {
	raw: string;
	text: string;
	scope: PaletteQueryScope;
}

interface ParsedSearchQuery {
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

export function parsePaletteQuery(raw: string): ParsedPaletteQuery {
	const trimmed = raw.trim();
	if (trimmed.startsWith(">")) {
		return { raw: trimmed, text: trimmed.slice(1).trim(), scope: "commands" };
	}
	if (trimmed.startsWith("#")) {
		return { raw: trimmed, text: trimmed.slice(1).trim(), scope: "tags" };
	}
	if (trimmed.startsWith("@")) {
		return { raw: trimmed, text: trimmed.slice(1).trim(), scope: "people" };
	}
	const prefix = /^(settings|folder|template):\s*/i.exec(trimmed);
	if (!prefix) return { raw: trimmed, text: trimmed, scope: "all" };
	const prefixName = prefix[1]?.toLowerCase();
	const scope: PaletteQueryScope =
		prefixName === "settings"
			? "settings"
			: prefixName === "folder"
				? "folders"
				: "templates";
	return { raw: trimmed, text: trimmed.slice(prefix[0].length), scope };
}

function kindsForScope(scope: PaletteQueryScope): readonly PaletteResultKind[] {
	switch (scope) {
		case "commands":
			return ["command"];
		case "settings":
			return ["setting"];
		case "folders":
			return ["folder"];
		case "tags":
			return ["tag", "note", "content"];
		case "people":
			return ["person", "note", "content"];
		case "templates":
			return ["template"];
		case "all":
			return [
				"command",
				"setting",
				"open-tab",
				"note",
				"content",
				"folder",
				"tag",
				"person",
				"database",
				"template",
			];
	}
}

export function paletteResultMatchesScope(
	result: PaletteResult,
	scope: PaletteQueryScope,
): boolean {
	return kindsForScope(scope).includes(result.kind);
}

export function rankPaletteResult(
	result: PaletteResult,
	parsed: ParsedPaletteQuery,
): number | null {
	if (!paletteResultMatchesScope(result, parsed.scope)) return null;
	const query = parsed.text.trim().toLowerCase();
	if (!query) {
		if (parsed.scope !== "all") return result.rankBoost ?? 0;
		return result.defaultVisible ? (result.rankBoost ?? 0) : null;
	}
	const tokens = query.split(/\s+/).filter(Boolean);
	const label = result.label.toLowerCase();
	const category = result.category.toLowerCase();
	const description = result.description?.toLowerCase() ?? "";
	const keywords = result.keywords.join(" ").toLowerCase();
	const trailing = result.trailing?.toLowerCase() ?? "";
	const searchable = `${label} ${keywords} ${category} ${description} ${trailing}`;
	if (!tokens.every((token) => searchable.includes(token))) return null;

	let score = 0;
	if (label === query) score = 1000;
	else if (label.startsWith(query)) score = 900;
	else if (tokens.every((token) => label.includes(token))) score = 800;
	else if (label.includes(query)) score = 700;
	else if (keywords.includes(query)) score = 600;
	else if (category.includes(query)) score = 500;
	else if (description.includes(query)) score = 400;
	else score = 300;
	return score + (result.rankBoost ?? 0);
}

export function movePaletteSelection(
	results: readonly PaletteResult[],
	selectedId: string | null,
	direction: -1 | 1,
): string | null {
	if (!results.some((result) => result.enabled)) return null;
	const selectedIndex = results.findIndex((result) => result.id === selectedId);
	const startIndex =
		selectedIndex >= 0 ? selectedIndex : direction === 1 ? -1 : 0;
	for (let offset = 1; offset <= results.length; offset += 1) {
		const index =
			(startIndex + direction * offset + results.length) % results.length;
		const result = results[index];
		if (result?.enabled) return result.id;
	}
	return null;
}

export function stepPaletteOption(
	options: readonly { value: string | number }[],
	currentValue: string | number | boolean | null,
	direction: -1 | 1,
): string | number | null {
	if (!options.length) return null;
	const currentIndex = options.findIndex(
		(option) => option.value === currentValue,
	);
	const startIndex =
		currentIndex >= 0 ? currentIndex : direction === 1 ? -1 : 0;
	const nextIndex = (startIndex + direction + options.length) % options.length;
	return options[nextIndex]?.value ?? null;
}

export function parseSearchQuery(raw: string): ParsedSearchQuery {
	return parseSearchQueryWithPeople(raw, true);
}

export function parseSearchQueryWithPeople(
	raw: string,
	enablePeople: boolean,
): ParsedSearchQuery {
	const tokens = tokenize(raw.trim());
	const request: SearchAdvancedRequest = {
		tags: [],
		people: [],
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
		if (enablePeople && token.startsWith("@")) {
			request.people?.push(token);
			continue;
		}
		if (lower.startsWith("tag:")) {
			const rest = unquote(token.slice(4));
			if (rest) request.tags?.push(rest.startsWith("#") ? rest : `#${rest}`);
			continue;
		}
		if (enablePeople && lower.startsWith("person:")) {
			const rest = unquote(token.slice(7));
			if (rest) request.people?.push(rest.startsWith("@") ? rest : `@${rest}`);
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
	for (const person of request.people ?? [])
		parts.push(person.startsWith("@") ? person : `@${person}`);
	if (request.tag_only) parts.push("tag:only");
	if (request.title_only) parts.push("title:only");
	if (request.query?.trim()) parts.push(quoteIfNeeded(request.query.trim()));
	return parts.join(" ").trim();
}
