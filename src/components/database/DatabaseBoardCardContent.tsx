import { useTranslation } from "react-i18next";
import { statusToneStyle } from "../../lib/statusProperties";
import type { DatabaseRow } from "../../lib/database/types";
import type { FileTreeAppearance, NoteTaskSummary } from "../../lib/tauri";
import { NoteThumbnail } from "../NoteThumbnail";
import { TaskProgressIndicator } from "../checklists/TaskProgressIndicator";
import { tagColorFromName } from "../editor/noteProperties/utils";
import type { EditorTextColor } from "../editor/textColors";
import { DatabasePriorityBars } from "../status/DatabasePriorityBars";
import { StatusRingIcon } from "../status/StatusRingIcon";
import { priorityDisplayLabel, statusDisplayLabel } from "../status/propertyOptionLabels";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";
import {
	DatabaseNoteAppearanceIcon,
	databaseNoteAppearanceStyle,
} from "./DatabaseNoteAppearanceIcon";
import { formatDatabaseTagLabel } from "./databaseTagLabel";

/** One field's chips on a card: the values shown plus how many more are hidden. */
export interface BoardCardValues {
	shown: string[];
	hiddenCount: number;
}

interface DatabaseBoardCardContentProps {
	row: DatabaseRow;
	title: string;
	appearance: FileTreeAppearance | null;
	statuses: BoardCardValues;
	priorities: BoardCardValues;
	tags: BoardCardValues;
	statusColors: Record<string, EditorTextColor>;
	/** Icon per tag when "beautiful tags" is on; null shows the tag name alone. */
	iconNameForTag: ((tag: string) => string) | null;
	/** The compact date shown when the view is sorted by a date, with its full form. */
	date: { short: string; full: string } | null;
	taskSummary: NoteTaskSummary | null;
}

function CountChip({ count }: { count: number }) {
	return count > 0 ? <span className="databaseBoardTag is-count">+{count}</span> : null;
}

/** A board card's body: cover, title with its meta on the right, then one row of chips. */
export function DatabaseBoardCardContent({
	row,
	title,
	appearance,
	statuses,
	priorities,
	tags,
	statusColors,
	iconNameForTag,
	date,
	taskSummary,
}: DatabaseBoardCardContentProps) {
	const { t } = useTranslation("shell");
	const appearanceStyle = databaseNoteAppearanceStyle(row.note_path, appearance);
	const hasChips = statuses.shown.length + priorities.shown.length + tags.shown.length > 0;

	return (
		<>
			<NoteThumbnail
				notePath={row.note_path}
				preview={row.preview ?? ""}
				className="databaseBoardCardThumbnail"
			/>
			<div className="databaseBoardCardMain">
				<div className="databaseBoardCardTitleRow">
					<span className="databaseBoardCardTitle" style={appearanceStyle}>
						{title}
					</span>
					{appearance?.icon || date || taskSummary ? (
						<span className="databaseBoardCardMeta" style={appearanceStyle}>
							{appearance?.icon ? (
								<DatabaseNoteAppearanceIcon
									notePath={row.note_path}
									appearance={appearance}
									className="databaseBoardCardTitleIcon"
									size="var(--icon-md)"
								/>
							) : null}
							{taskSummary ? (
								<TaskProgressIndicator
									summary={taskSummary}
									className="databaseBoardCardTaskProgress"
								/>
							) : null}
							{date ? (
								<span className="databaseBoardCardTimestamp" title={date.full}>
									{date.short}
								</span>
							) : null}
						</span>
					) : null}
				</div>
				{hasChips ? (
					<div className="databaseBoardCardChips">
						{statuses.shown.map((status) => (
							<span
								key={`status:${status}`}
								className="propertyValueText databaseBoardCardStatus"
								style={statusToneStyle(status, statusColors)}
								title={t("collections.boardCard.statusTooltip", {
									value: statusDisplayLabel(status, t),
								})}
							>
								<StatusRingIcon value={status} className="propertyValueTextIcon" />
								<span>{statusDisplayLabel(status, t)}</span>
							</span>
						))}
						<CountChip count={statuses.hiddenCount} />
						{priorities.shown.map((priority) => (
							<span
								key={`priority:${priority}`}
								className="propertyValueText databaseBoardCardStatus is-priority"
								title={t("collections.boardCard.priorityTooltip", {
									value: priorityDisplayLabel(priority, t),
								})}
							>
								<DatabasePriorityBars value={priority} className="propertyValueTextIcon" />
								<span>{priorityDisplayLabel(priority, t)}</span>
							</span>
						))}
						<CountChip count={priorities.hiddenCount} />
						{tags.shown.map((tag) => (
							<span
								key={`tag:${tag}`}
								className="databaseBoardTag"
								data-chip-tone={tagColorFromName(tag)}
								title={t("collections.boardCard.tagTooltip", {
									value: formatDatabaseTagLabel(tag),
								})}
							>
								{iconNameForTag ? (
									<DatabaseColumnIcon
										iconName={iconNameForTag(tag)}
										className="databaseTagPillIcon"
										size="var(--icon-xs)"
									/>
								) : null}
								<span className="databaseBoardTagLabel">{formatDatabaseTagLabel(tag)}</span>
							</span>
						))}
						<CountChip count={tags.hiddenCount} />
					</div>
				) : null}
			</div>
		</>
	);
}
