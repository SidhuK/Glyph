import type { Shortcut } from "../../lib/shortcuts";
import { springPresets } from "../ui/animations";

export interface Command {
	id: string;
	label: string;
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

export function parseSearchQuery(raw: string): {
	tags: string[];
	text: string;
} {
	const tokens = raw.trim().split(/\s+/).filter(Boolean);
	const tags: string[] = [];
	const textParts: string[] = [];
	for (const token of tokens) {
		if (token.startsWith("#")) {
			tags.push(token);
			continue;
		}
		if (token.toLowerCase().startsWith("tag:")) {
			const rest = token.slice(4).trim();
			if (rest) tags.push(rest.startsWith("#") ? rest : `#${rest}`);
			continue;
		}
		textParts.push(token);
	}
	return { tags, text: textParts.join(" ").trim() };
}
