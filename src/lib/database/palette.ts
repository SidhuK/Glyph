import type { CSSProperties } from "react";
import {
	type EditorTextColor,
	getEditorTextColorOption,
} from "../../components/editor/textColors";

const DATABASE_TONES = [
	"var(--color-blue-500)",
	"var(--color-orange-dark-400)",
	"var(--color-green-500)",
	"var(--color-purple-500)",
	"var(--color-yellow-500)",
	"var(--color-red-500)",
] as const;

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
		const { cssVar, fallbackHex } = getEditorTextColorOption(color);
		return {
			"--database-tone": `var(${cssVar}, ${fallbackHex})`,
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
