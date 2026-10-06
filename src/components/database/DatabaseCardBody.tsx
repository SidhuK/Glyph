import { useCallback, useMemo } from "react";
import { useDateDisplayFormat, useFileTreeContext } from "../../contexts";
import { formatDatabaseDateTime } from "../../lib/database/config";
import type { DatabaseRow } from "../../lib/database/types";
import type { DateDisplayFormat } from "../../lib/dateDisplayFormat";
import {
	DEFAULT_TAG_ICON_NAME,
	resolveTagIconName,
	tagIconOverridesFromAppearance,
} from "../../lib/tagIcons";
import type { NoteTaskSummary } from "../../lib/tauri";
import { TaskProgressIndicator } from "../checklists/TaskProgressIndicator";
import type { EditorTextColor } from "../editor/textColors";
import { PriorityPropertyPill } from "../status/PriorityPropertyPill";
import { StatusPropertyPill } from "../status/StatusPropertyPill";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";
import {
	DatabaseNoteAppearanceIcon,
	databaseNoteAppearanceStyle,
} from "./DatabaseNoteAppearanceIcon";
import { formatDatabaseTagLabel } from "./databaseTagLabel";

const MAX_VISIBLE_PILLS = 2;

export const EMPTY_TASK_SUMMARY: NoteTaskSummary = {
	total_count: 0,
	completed_count: 0,
	open_count: 0,
};

export function useCardTagIconName(): (tag: string) => string {
	const { beautifulTags, tagAppearance } = useFileTreeContext();
	const overrides = useMemo(() => tagIconOverridesFromAppearance(tagAppearance), [tagAppearance]);
	return useCallback(
		(tag: string) =>
			beautifulTags ? resolveTagIconName(tag, overrides, beautifulTags) : DEFAULT_TAG_ICON_NAME,
		[beautifulTags, overrides],
	);
}

/** An empty field list shows every card field. */
function isCardFieldVisible(fields: string[] | undefined, fieldId: string): boolean {
	if (!fields || fields.length === 0) return true;
	return fields.includes(fieldId);
}

function cardTextPropertyValues(row: DatabaseRow, kind: "status" | "priority"): string[] {
	const values: string[] = [];
	for (const property of Object.values(row.properties)) {
		if (property.kind !== kind) continue;
		const value = property.value_text?.trim();
		if (value) values.push(value);
	}
	return values;
}

function formatCompactDateTime(value: string, dateFormat: DateDisplayFormat): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return formatDatabaseDateTime(value, dateFormat);
	}
	const month = date.toLocaleString("en-US", { month: "short" });
	return `${month} ${date.getDate()}`;
}

interface DatabaseCardBodyProps {
	row: DatabaseRow;
	title: string;
	cardFields?: string[];
	statusColors: Record<string, EditorTextColor>;
	taskSummary: NoteTaskSummary;
	iconNameForTag: (tag: string) => string;
}

export function DatabaseCardBody({
	row,
	title,
	cardFields,
	statusColors,
	taskSummary,
	iconNameForTag,
}: DatabaseCardBodyProps) {
	const dateDisplayFormat = useDateDisplayFormat();
	const { beautifulTags, itemAppearance } = useFileTreeContext();
	const visible = (fieldId: string) => isCardFieldVisible(cardFields, fieldId);
	const visibleTags = row.tags.slice(0, 1);
	const extraTagCount = Math.max(row.tags.length - 1, 0);
	const statusValues = cardTextPropertyValues(row, "status");
	const visibleStatuses = statusValues.slice(0, MAX_VISIBLE_PILLS);
	const extraStatusCount = Math.max(statusValues.length - MAX_VISIBLE_PILLS, 0);
	const priorityValues = cardTextPropertyValues(row, "priority");
	const visiblePriorities = priorityValues.slice(0, MAX_VISIBLE_PILLS);
	const extraPriorityCount = Math.max(priorityValues.length - MAX_VISIBLE_PILLS, 0);
	const updatedLabel = formatDatabaseDateTime(row.updated, dateDisplayFormat);
	const noteAppearance = itemAppearance[row.note_path] ?? null;
	const hasStatusOrPriority =
		(visible("status") && visibleStatuses.length > 0) ||
		(visible("priority") && visiblePriorities.length > 0);
	const hasTags = visible("tags") && visibleTags.length > 0;

	return (
		<>
			<div className="databaseBoardCardMain">
				<div className="databaseBoardCardHeaderRow">
					<span
						className="databaseBoardCardTitle"
						style={databaseNoteAppearanceStyle(row.note_path, noteAppearance)}
					>
						<DatabaseNoteAppearanceIcon
							notePath={row.note_path}
							appearance={noteAppearance}
							className="databaseBoardCardTitleIcon"
							size="var(--icon-md)"
						/>
						{title}
					</span>
					{visible("task_progress") && taskSummary.total_count > 0 ? (
						<TaskProgressIndicator
							summary={taskSummary}
							className="databaseBoardCardTaskProgress"
						/>
					) : null}
				</div>
				{visible("date") ? (
					<div className="databaseBoardCardSubline">
						<span className="databaseBoardCardTimestamp" title={`Updated ${updatedLabel}`}>
							{formatCompactDateTime(row.updated, dateDisplayFormat)}
						</span>
					</div>
				) : null}
			</div>
			{hasStatusOrPriority || hasTags ? (
				<div className="databaseBoardCardFooter">
					{hasStatusOrPriority ? (
						<div className="databaseBoardCardMetaRow">
							<div className="databaseBoardCardMetaGroup">
								{visible("status") &&
									visibleStatuses.map((status, statusIndex) => (
										<StatusPropertyPill
											key={`${row.note_path}:status:${statusIndex}:${status}`}
											value={status}
											colors={statusColors}
											className="databaseBoardCardStatus"
										/>
									))}
								{visible("status") && extraStatusCount > 0 ? (
									<span className="databaseBoardTag is-muted">+{extraStatusCount}</span>
								) : null}
							</div>
							<div className="databaseBoardCardMetaGroup">
								{visible("priority") &&
									visiblePriorities.map((priority, priorityIndex) => (
										<PriorityPropertyPill
											key={`${row.note_path}:priority:${priorityIndex}:${priority}`}
											value={priority}
											className="databaseBoardCardStatus"
										/>
									))}
								{visible("priority") && extraPriorityCount > 0 ? (
									<span className="databaseBoardTag is-muted">+{extraPriorityCount}</span>
								) : null}
							</div>
						</div>
					) : null}
					{hasTags ? (
						<div className="databaseBoardCardTags">
							{visibleTags.map((tag) => (
								<span
									key={`${row.note_path}:${tag}`}
									className="databaseBoardTag"
									data-beautiful-tags={beautifulTags ? "true" : undefined}
									title={formatDatabaseTagLabel(tag)}
								>
									<DatabaseColumnIcon
										iconName={iconNameForTag(tag)}
										className="databaseTagPillIcon"
										size="var(--icon-xs)"
									/>
									{formatDatabaseTagLabel(tag)}
								</span>
							))}
							{extraTagCount > 0 ? (
								<span className="databaseBoardTag is-muted">+{extraTagCount}</span>
							) : null}
						</div>
					) : null}
				</div>
			) : null}
		</>
	);
}
