import { extractErrorMessage } from "../../../lib/errorUtils";
import type { AiHeader } from "../../../lib/tauri";

export function errMessage(err: unknown): string {
	return extractErrorMessage(err);
}

export function headersToText(headers: AiHeader[]): string {
	return headers
		.map((h) => `${h.key}: ${h.value}`)
		.join("\n")
		.trim();
}

export function parseHeadersText(text: string): AiHeader[] {
	const lines = text
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
	const out: AiHeader[] = [];
	for (const line of lines) {
		const idx = line.indexOf(":");
		if (idx <= 0) continue;
		const key = line.slice(0, idx).trim();
		const value = line.slice(idx + 1).trim();
		if (!key) continue;
		out.push({ key, value });
	}
	return out;
}
