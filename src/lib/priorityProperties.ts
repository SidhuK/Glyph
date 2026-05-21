import type { CSSProperties } from "react";
import { databaseValueToneStyleForColor } from "./database/palette";

export interface PriorityOption {
	id: "no" | "low" | "medium" | "high";
	label: string;
	color: "gray" | "green" | "yellow" | "red";
	iconKey: "no" | "low" | "medium" | "high";
	aliases: readonly string[];
}

export interface PrioritySelectOption {
	id: string;
	label: string;
	custom?: boolean;
}

const PRIORITY_OPTIONS = [
	{
		id: "no",
		label: "No",
		color: "gray",
		iconKey: "no",
		aliases: ["no", "none", "false"],
	},
	{
		id: "low",
		label: "Low",
		color: "green",
		iconKey: "low",
		aliases: ["low"],
	},
	{
		id: "medium",
		label: "Medium",
		color: "yellow",
		iconKey: "medium",
		aliases: ["medium", "med"],
	},
	{
		id: "high",
		label: "High",
		color: "red",
		iconKey: "high",
		aliases: ["high"],
	},
] as const satisfies readonly PriorityOption[];

const PRIORITY_BY_ID = new Map<string, PriorityOption>(
	PRIORITY_OPTIONS.map((option) => [option.id, option]),
);

const PRIORITY_ALIAS_TO_ID = new Map<string, string>(
	PRIORITY_OPTIONS.flatMap((option) => [
		[option.id, option.id] as const,
		...option.aliases.map(
			(alias) => [normalizePriorityText(alias), option.id] as const,
		),
	]),
);

function normalizePriorityText(value: string): string {
	return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function priorityIdFromValue(value: string | null | undefined): string | null {
	const normalized = normalizePriorityText(value ?? "");
	return normalized ? (PRIORITY_ALIAS_TO_ID.get(normalized) ?? null) : null;
}

export function priorityOptionFromValue(
	value: string | null | undefined,
): PriorityOption | null {
	const priorityId = priorityIdFromValue(value);
	return priorityId ? (PRIORITY_BY_ID.get(priorityId) ?? null) : null;
}

export function priorityLabel(value: string | null | undefined): string {
	const option = priorityOptionFromValue(value);
	if (option) return option.label;
	return (value ?? "").trim();
}

export function priorityToneStyle(
	value: string | null | undefined,
): CSSProperties {
	const option = priorityOptionFromValue(value);
	const fallbackValue = (value ?? "").trim();
	return databaseValueToneStyleForColor(
		option?.id ?? fallbackValue,
		option?.color ?? null,
	);
}

export function priorityTextStyle(
	value: string | null | undefined,
): CSSProperties {
	const option = priorityOptionFromValue(value);
	const toneStyle = priorityToneStyle(value);
	return {
		...toneStyle,
		color:
			option?.id === "no"
				? "var(--text-muted)"
				: "color-mix(in srgb, var(--database-tone) 78%, var(--text-primary))",
	};
}

export function priorityColorKey(
	value: string | null | undefined,
): string | null {
	const trimmed = (value ?? "").trim();
	if (!trimmed) return null;
	const option = priorityOptionFromValue(trimmed);
	if (option) return option.id;
	const normalized = normalizePriorityText(trimmed).replace(/\s+/g, "_");
	return normalized || null;
}

export function priorityOptionsWithCustomValues(
	values: Iterable<string | null | undefined>,
): PrioritySelectOption[] {
	const options = PRIORITY_OPTIONS.map((option) => ({
		id: option.id,
		label: option.label,
	}));
	const seen = new Set<string>(options.map((option) => option.id));
	const customOptions: PrioritySelectOption[] = [];
	for (const value of values) {
		const label = (value ?? "").trim();
		const priorityId = priorityColorKey(label);
		if (!label || !priorityId || seen.has(priorityId)) continue;
		seen.add(priorityId);
		customOptions.push({ id: priorityId, label, custom: true });
	}
	customOptions.sort((left, right) =>
		left.label.localeCompare(right.label, undefined, {
			numeric: true,
			sensitivity: "base",
		}),
	);
	return [...options, ...customOptions];
}
