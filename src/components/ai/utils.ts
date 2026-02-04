import type { AiHeader } from "../../lib/tauri";
import { TauriInvokeError } from "../../lib/tauri";

export function errMessage(err: unknown): string {
	if (err instanceof TauriInvokeError) return err.message;
	if (err instanceof Error) return err.message;
	return String(err);
}

export function clampInt(n: number, min: number, max: number): number {
	if (!Number.isFinite(n)) return min;
	return Math.max(min, Math.min(max, Math.floor(n)));
}

export function estimateTokens(chars: number): number {
	return Math.ceil(chars / 4);
}

export function isUuid(id: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		id,
	);
}

export function truncateWithNotice(
	text: string,
	maxChars: number,
): { text: string; truncated: boolean } {
	if (maxChars <= 0) return { text: "", truncated: true };
	if (text.length <= maxChars) return { text, truncated: false };
	const suffix = "\n…(truncated)";
	const keep = Math.max(0, maxChars - suffix.length);
	return { text: `${text.slice(0, keep)}${suffix}`, truncated: true };
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
