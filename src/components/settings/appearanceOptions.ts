import { invoke } from "../../lib/tauri";

export const DEFAULT_FONT_FAMILY = "Geist";

export async function loadAvailableFonts(): Promise<string[]> {
	const curatedFonts = new Set<string>([DEFAULT_FONT_FAMILY]);
	try {
		const fonts = await invoke("system_fonts_list");
		const uniq = new Set<string>(curatedFonts);
		for (const font of fonts) {
			const trimmed = font.trim();
			if (trimmed) uniq.add(trimmed);
		}
		const sorted = Array.from(uniq).sort((a, b) =>
			a.localeCompare(b, undefined, { sensitivity: "base" }),
		);
		if (sorted.length) return sorted;
	} catch {
		// no-op
	}
	return Array.from(curatedFonts);
}

export async function loadAvailableMonospaceFonts(): Promise<string[]> {
	const curatedFonts = new Set<string>(["JetBrains Mono"]);
	try {
		const fonts = await invoke("system_monospace_fonts_list");
		const uniq = new Set<string>(curatedFonts);
		for (const font of fonts) {
			const trimmed = font.trim();
			if (trimmed) uniq.add(trimmed);
		}
		const sorted = Array.from(uniq).sort((a, b) =>
			a.localeCompare(b, undefined, { sensitivity: "base" }),
		);
		if (sorted.length) return sorted;
	} catch {
		// no-op
	}
	return Array.from(curatedFonts);
}
