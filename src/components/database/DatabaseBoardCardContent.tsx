import { useTranslation } from "react-i18next";
import { statusToneStyle } from "../../lib/statusProperties";
import type { DatabaseRow } from "../../lib/database/types";
import type { FileTreeAppearance, NoteTaskSummary } from "../../lib/tauri";
import { NoteThumbnail } from "../NoteThumbnail";
import { TaskProgressIndicator } from "../checklists/TaskProgressIndicator";
import type { EditorTextColor } from "../editor/textColors";
import { DatabasePriorityBars } from "../status/DatabasePriorityBars";
import { StatusRingIcon } from "../status/StatusRingIcon";
import { priorityDisplayLabel, statusDisplayLabel } from "../status/propertyOptionLabels";
import {
	DatabaseNoteAppearanceIcon,
	databaseNoteAppearanceStyle,
} from "./DatabaseNoteAppearanceIcon";
import { HairlineTagList } from "./HairlineTagList";
import { formatDatabaseTagLabel } from "./databaseTagLabel";

const BOARD_CARD_TAG_LIMIT = 3;

interface DatabaseBoardCardContentProps {
	row: DatabaseRow;
	title: string;
	appearance: FileTreeAppearance | null;
	status: string | null;
	priority: string | null;
	tags: string[];
	statusColors: Record<string, EditorTextColor>;
	/** Icon per tag when "beautiful tags" is on; null shows the tag name alone. */
	iconNameForTag: ((tag: string) => string) | null;
	/** The compact date shown when the view is sorted by a date, with its full form. */
	date: { short: string; full: string } | null;
	taskSummary: NoteTaskSummary | null;
}

/** A board card's body: cover, title with its meta on the right, then one line of tags. */
export function DatabaseBoardCardContent({
	row,
	title,
	appearance,
	status,
	priority,
	tags,
	statusColors,
	iconNameForTag,
	date,
	taskSummary,
}: DatabaseBoardCardContentProps) {
	const { t } = useTranslation("shell");
	const appearanceStyle = databaseNoteAppearanceStyle(row.note_path, appearance);
	const priorityLabel = priority
		? t("collections.boardCard.priorityTooltip", { value: priorityDisplayLabel(priority, t) })
		: "";
	const statusLabel = status
		? t("collections.boardCard.statusTooltip", { value: statusDisplayLabel(status, t) })
		: "";

	return (
		<>
			<NoteThumbnail
				notePath={row.note_path}
				preview={row.preview ?? ""}
				className="databaseBoardCardThumbnail"
			/>
			<div className="databaseBoardCardMain">
				<div className="databaseBoardCardTitleRow">
					{priority ? (
						<span
							className="databaseBoardCardLead"
							role="img"
							aria-label={priorityLabel}
							title={priorityLabel}
						>
							<DatabasePriorityBars value={priority} className="databaseBoardCardLeadIcon" />
						</span>
					) : null}
					{status ? (
						<span
							className="databaseBoardCardLead"
							role="img"
							aria-label={statusLabel}
							title={statusLabel}
							style={statusToneStyle(status, statusColors)}
						>
							<StatusRingIcon value={status} className="databaseBoardCardLeadIcon" />
						</span>
					) : null}
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
				{tags.length > 0 ? (
					<HairlineTagList
						tags={tags}
						limit={BOARD_CARD_TAG_LIMIT}
						iconNameForTag={iconNameForTag}
						titleForTag={(tag) =>
							t("collections.boardCard.tagTooltip", { value: formatDatabaseTagLabel(tag) })
						}
						className="databaseBoardCardTags"
					/>
				) : null}
			</div>
		</>
	);
}
