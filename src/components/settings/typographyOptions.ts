import { invoke } from "../../lib/tauri";

export const DEFAULT_FONT_FAMILY = "Geist";

export async function loadAvailableFonts(): Promise<string[]> {
	const fonts = new Set<string>([DEFAULT_FONT_FAMILY]);
	try {
		for (const font of await invoke("system_fonts_list")) {
			const trimmed = font.trim();
			if (trimmed) fonts.add(trimmed);
		}
	} catch {
		// no-op
	}
	return Array.from(fonts).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export async function loadAvailableMonospaceFonts(): Promise<string[]> {
	const fonts = new Set<string>(["JetBrains Mono"]);
	try {
		for (const font of await invoke("system_monospace_fonts_list")) {
			const trimmed = font.trim();
			if (trimmed) fonts.add(trimmed);
		}
	} catch {
		// no-op
	}
	return Array.from(fonts).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
