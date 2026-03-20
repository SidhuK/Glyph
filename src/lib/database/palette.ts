import type { DatabaseColumn } from "./types";
import type { CSSProperties } from "react";

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

export function databaseToneStyle(seed: string): CSSProperties {
	const tone = DATABASE_TONES[hashSeed(normalizeToneSeed(seed)) % DATABASE_TONES.length];
	return {
		"--database-tone": tone,
	} as CSSProperties;
}

export function databaseValueToneStyle(value: string): CSSProperties {
	return databaseToneStyle(value);
}

export function databaseColumnToneStyle(column: Pick<
	DatabaseColumn,
	"id" | "type" | "property_key" | "property_kind" | "label"
>): CSSProperties {
	const seed = [
		column.id,
		column.type,
		column.property_key ?? "",
		column.property_kind ?? "",
		column.label,
	].join(":");
	return databaseToneStyle(seed);
}
