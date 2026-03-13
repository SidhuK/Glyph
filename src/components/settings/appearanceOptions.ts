import {
	MAX_EDITOR_FONT_SIZE,
	MAX_UI_FONT_SIZE,
	MIN_EDITOR_FONT_SIZE,
	MIN_UI_FONT_SIZE,
} from "../../lib/settings";
import { invoke } from "../../lib/tauri";

export const DEFAULT_FONT_FAMILY = "Inter";
export const UI_FONT_SIZE_OPTIONS = Array.from(
	{ length: MAX_UI_FONT_SIZE - MIN_UI_FONT_SIZE + 1 },
	(_, idx) => MIN_UI_FONT_SIZE + idx,
);
export const EDITOR_FONT_SIZE_OPTIONS = Array.from(
	{ length: MAX_EDITOR_FONT_SIZE - MIN_EDITOR_FONT_SIZE + 1 },
	(_, idx) => MIN_EDITOR_FONT_SIZE + idx,
);

export async function loadAvailableFonts(): Promise<string[]> {
	try {
		const fonts = await invoke("system_fonts_list");
		const uniq = new Set<string>();
		for (const font of fonts) {
			const trimmed = font.trim();
			if (trimmed) uniq.add(trimmed);
		}
		const sorted = Array.from(uniq).sort((a, b) => a.localeCompare(b));
		if (sorted.length) return sorted;
	} catch {
		// no-op
	}
	return [DEFAULT_FONT_FAMILY];
}

export async function loadAvailableMonospaceFonts(): Promise<string[]> {
	try {
		const fonts = await invoke("system_monospace_fonts_list");
		const uniq = new Set<string>();
		for (const font of fonts) {
			const trimmed = font.trim();
			if (trimmed) uniq.add(trimmed);
		}
		const sorted = Array.from(uniq).sort((a, b) => a.localeCompare(b));
		if (sorted.length) return sorted;
	} catch {
		// no-op
	}
	return ["JetBrains Mono"];
}
