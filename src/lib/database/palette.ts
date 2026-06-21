import type { CSSProperties } from "react";
import type { EditorTextColor } from "../../components/editor/textColors";

const DATABASE_TONES = [
	"var(--color-blue-500)",
	"var(--color-orange-dark-400)",
	"var(--color-green-500)",
	"var(--color-purple-500)",
	"var(--color-yellow-500)",
	"var(--color-red-500)",
] as const;

const DATABASE_TONE_BY_COLOR: Record<EditorTextColor, string> = {
	gray: "var(--glyph-inline-color-gray, #626f86)",
	brown: "var(--glyph-inline-color-brown, #9f6b53)",
	orange: "var(--glyph-inline-color-orange, #d9730d)",
	yellow: "var(--glyph-inline-color-yellow, #cb912f)",
	green: "var(--glyph-inline-color-green, #448361)",
	blue: "var(--glyph-inline-color-blue, #0c66e4)",
	purple: "var(--glyph-inline-color-purple, #7e5bef)",
	red: "var(--glyph-inline-color-red, #e03e3e)",
};

function hashSeed(seed: string): number {
	let hash = 0;
	for (let index = 0; index < seed.length; index += 1) {
		hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
	}
	return hash;
}

function normalizeToneSeed(seed: string): string {
	return seed.trim().toLowerCase().replace(/^#+/, "");
}

function databaseToneStyle(seed: string): CSSProperties {
	const tone =
		DATABASE_TONES[hashSeed(normalizeToneSeed(seed)) % DATABASE_TONES.length];
	return {
		"--database-tone": tone,
	} as CSSProperties;
}

function databaseToneStyleForColor(
	color: EditorTextColor | null | undefined,
	seed: string,
): CSSProperties {
	if (color) {
		return {
			"--database-tone": DATABASE_TONE_BY_COLOR[color],
		} as CSSProperties;
	}
	return databaseToneStyle(seed);
}

export function databaseValueToneStyleForColor(
	value: string,
	color: EditorTextColor | null | undefined,
): CSSProperties {
	return databaseToneStyleForColor(color, value);
}
