import type { CSSProperties } from "react";
import type { EditorTextColor } from "../components/editor/textColors";
import { databaseValueToneStyleForColor } from "./database/palette";

export interface StatusOption {
	id: string;
	label: string;
	color: EditorTextColor;
	iconKey:
		| "activity"
		| "archive"
		| "cancel"
		| "check_square"
		| "clock"
		| "file_block"
		| "file_search"
		| "progress"
		| "queue"
		| "task"
		| "waiting";
	aliases: readonly string[];
}

export interface StatusSelectOption {
	id: string;
	label: string;
	custom?: boolean;
}

const STATUS_OPTIONS = [
	{
		id: "backlog",
		label: "Backlog",
		color: "gray",
		iconKey: "queue",
		aliases: ["backlog", "icebox", "later", "someday"],
	},
	{
		id: "todo",
		label: "Todo",
		color: "gray",
		iconKey: "task",
		aliases: [
			"todo",
			"to do",
			"not started",
			"not-started",
			"open",
			"new",
			"unstarted",
		],
	},
	{
		id: "in_progress",
		label: "In progress",
		color: "blue",
		iconKey: "progress",
		aliases: ["in progress", "in-progress", "progress", "doing", "wip"],
	},
	{
		id: "in_review",
		label: "In review",
		color: "yellow",
		iconKey: "file_search",
		aliases: ["in review", "in-review", "review", "reviewing"],
	},
	{
		id: "blocked",
		label: "Blocked",
		color: "red",
		iconKey: "file_block",
		aliases: ["blocked", "stuck"],
	},
	{
		id: "waiting",
		label: "Waiting",
		color: "orange",
		iconKey: "waiting",
		aliases: [
			"waiting",
			"pending",
			"submitted",
			"sent",
			"requested",
			"paused",
			"pause",
			"on hold",
			"on-hold",
			"hold",
			"deferred",
			"awaiting",
			"awaiting approval",
			"waiting for approval",
			"waiting for customer",
			"waiting for support",
		],
	},
	{
		id: "done",
		label: "Done",
		color: "green",
		iconKey: "check_square",
		aliases: [
			"done",
			"finished",
			"complete",
			"completed",
			"resolved",
			"closed",
			"success",
			"successful",
			"approved",
			"published",
			"won",
		],
	},
	{
		id: "canceled",
		label: "Canceled",
		color: "red",
		iconKey: "cancel",
		aliases: [
			"canceled",
			"cancelled",
			"rejected",
			"failed",
			"failure",
			"error",
			"expired",
			"wont do",
			"won't do",
			"wont fix",
			"won't fix",
			"duplicate",
			"could not reproduce",
			"lost",
		],
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
	"backlog",
	"todo",
	"in_progress",
	"in_review",
	"blocked",
	"waiting",
	"done",
	"canceled",
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

function normalizeStatusText(value: string): string {
	return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function statusIdFromValue(value: string | null | undefined): string | null {
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

export function statusTextStyle(
	value: string | null | undefined,
	colors: Record<string, EditorTextColor> = {},
): CSSProperties {
	return {
		...statusToneStyle(value, colors),
		color: "color-mix(in srgb, var(--database-tone) 78%, var(--text-primary))",
	};
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
