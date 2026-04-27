import type { CSSProperties } from "react";
import type { EditorTextColor } from "../components/editor/textColors";
import { databaseValueToneStyleForColor } from "./database/palette";

export interface StatusOption {
	id: string;
	label: string;
	color: EditorTextColor;
	iconKey:
		| "circle"
		| "play"
		| "blocked"
		| "pause"
		| "draft"
		| "archive"
		| "check"
		| "hourglass"
		| "loading"
		| "sent"
		| "review"
		| "failed"
		| "expired";
	aliases: readonly string[];
}

export interface StatusSelectOption {
	id: string;
	label: string;
	custom?: boolean;
}

export const STATUS_OPTIONS = [
	{
		id: "not_started",
		label: "Not started",
		color: "gray",
		iconKey: "circle",
		aliases: ["not started", "not-started", "todo", "to do", "backlog"],
	},
	{
		id: "active",
		label: "Active",
		color: "blue",
		iconKey: "play",
		aliases: ["active", "started"],
	},
	{
		id: "draft",
		label: "Draft",
		color: "purple",
		iconKey: "draft",
		aliases: ["draft", "drafting"],
	},
	{
		id: "in_progress",
		label: "In progress",
		color: "blue",
		iconKey: "loading",
		aliases: ["in progress", "in-progress", "progress", "doing", "wip"],
	},
	{
		id: "in_review",
		label: "In review",
		color: "yellow",
		iconKey: "review",
		aliases: ["in review", "in-review", "review", "reviewing"],
	},
	{
		id: "blocked",
		label: "Blocked",
		color: "red",
		iconKey: "blocked",
		aliases: ["blocked", "stuck"],
	},
	{
		id: "paused",
		label: "Paused",
		color: "yellow",
		iconKey: "pause",
		aliases: ["paused", "pause", "on hold", "on-hold", "hold"],
	},
	{
		id: "pending",
		label: "Pending",
		color: "orange",
		iconKey: "hourglass",
		aliases: ["pending", "waiting"],
	},
	{
		id: "submitted",
		label: "Submitted",
		color: "purple",
		iconKey: "sent",
		aliases: ["submitted", "sent"],
	},
	{
		id: "failed",
		label: "Failed",
		color: "red",
		iconKey: "failed",
		aliases: ["failed", "failure", "error"],
	},
	{
		id: "expired",
		label: "Expired",
		color: "gray",
		iconKey: "expired",
		aliases: ["expired"],
	},
	{
		id: "success",
		label: "Success",
		color: "green",
		iconKey: "check",
		aliases: ["success", "successful"],
	},
	{
		id: "completed",
		label: "Completed",
		color: "green",
		iconKey: "check",
		aliases: ["completed", "complete"],
	},
	{
		id: "done",
		label: "Done",
		color: "green",
		iconKey: "check",
		aliases: ["done", "finished"],
	},
	{
		id: "archived",
		label: "Archived",
		color: "gray",
		iconKey: "archive",
		aliases: ["archived", "archive"],
	},
] as const satisfies readonly StatusOption[];

const STATUS_BY_ID: Map<string, StatusOption> = new Map(
	STATUS_OPTIONS.map((option) => [option.id, option]),
);
const STATUS_PICKER_ORDER = [
	"not_started",
	"draft",
	"pending",
	"submitted",
	"in_review",
	"active",
	"in_progress",
	"blocked",
	"paused",
	"failed",
	"expired",
	"success",
	"completed",
	"done",
	"archived",
] as const satisfies readonly StatusOption["id"][];
const STATUS_ALIAS_TO_ID = new Map<string, string>(
	STATUS_OPTIONS.flatMap((option) => [
		[option.id, option.id] as const,
		...option.aliases.map(
			(alias) => [normalizeStatusText(alias), option.id] as const,
		),
	]),
);

export function normalizeStatusText(value: string): string {
	return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function statusIdFromValue(
	value: string | null | undefined,
): string | null {
	const normalized = normalizeStatusText(value ?? "");
	return normalized ? (STATUS_ALIAS_TO_ID.get(normalized) ?? null) : null;
}

export function statusOptionFromValue(
	value: string | null | undefined,
): StatusOption | null {
	const statusId = statusIdFromValue(value);
	return statusId ? (STATUS_BY_ID.get(statusId) ?? null) : null;
}

export function statusLabel(value: string | null | undefined): string {
	const option = statusOptionFromValue(value);
	if (option) return option.label;
	return (value ?? "").trim();
}

export function statusToneStyle(
	value: string | null | undefined,
	colors: Record<string, EditorTextColor> = {},
): CSSProperties {
	const option = statusOptionFromValue(value);
	const fallbackValue = (value ?? "").trim();
	const colorKey = statusColorKey(value);
	const toneSeed = option?.id ?? fallbackValue;
	return databaseValueToneStyleForColor(
		toneSeed,
		(colorKey ? colors[colorKey] : null) ?? option?.color ?? null,
	);
}

export function statusColorKey(
	value: string | null | undefined,
): string | null {
	const trimmed = (value ?? "").trim();
	if (!trimmed) return null;
	const option = statusOptionFromValue(trimmed);
	if (option) return option.id;
	const normalized = normalizeStatusText(trimmed).replace(/\s+/g, "_");
	return normalized || null;
}

export function statusOptionsWithCustomValues(
	values: Iterable<string | null | undefined>,
): StatusSelectOption[] {
	const options: StatusSelectOption[] = [];
	for (const statusId of STATUS_PICKER_ORDER) {
		const option = STATUS_BY_ID.get(statusId);
		if (!option) continue;
		options.push({ id: option.id, label: option.label });
	}
	const seen = new Set(options.map((option) => option.id));
	const customOptions: StatusSelectOption[] = [];
	for (const value of values) {
		const label = (value ?? "").trim();
		const statusId = statusColorKey(label);
		if (
			!label ||
			!statusId ||
			seen.has(statusId) ||
			STATUS_BY_ID.has(statusId)
		) {
			continue;
		}
		seen.add(statusId);
		customOptions.push({ id: statusId, label, custom: true });
	}
	customOptions.sort((left, right) =>
		left.label.localeCompare(right.label, undefined, {
			numeric: true,
			sensitivity: "base",
		}),
	);
	return [...options, ...customOptions];
}
