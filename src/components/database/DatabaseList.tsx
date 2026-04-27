import { Tag01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	databaseListFolderPath,
	databaseListTitle,
	visibleDatabaseListTags,
} from "../../lib/database/list";
import { databaseValueToneStyle } from "../../lib/database/palette";
import type { DatabaseRow } from "../../lib/database/types";
import { formatDatabaseTagLabel } from "./databaseTagLabel";

interface DatabaseListProps {
	rows: DatabaseRow[];
	selectedRowPath: string | null;
	onSelectRow: (notePath: string) => void;
	onOpenRow: (notePath: string) => void;
}

export function DatabaseList({
	rows,
	selectedRowPath,
	onSelectRow,
	onOpenRow,
}: DatabaseListProps) {
	if (rows.length === 0) {
		return (
			<div className="databaseListShell">
				<div className="databaseListEmpty databaseCellEmpty">
					No matching notes
				</div>
			</div>
		);
	}

	return (
		<div className="databaseListShell">
			<ul className="databaseList" aria-label="Database notes">
				{rows.map((row) => {
					const title = databaseListTitle(row);
					const folderPath = databaseListFolderPath(row);
					const { visibleTags, extraTagCount } = visibleDatabaseListTags(
						row.tags,
						2,
					);

					return (
						<li key={row.note_path} className="databaseListItem">
							<button
								type="button"
								className="databaseListRow"
								data-state={
									row.note_path === selectedRowPath ? "selected" : undefined
								}
								onClick={() => onSelectRow(row.note_path)}
								onDoubleClick={() => onOpenRow(row.note_path)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										onOpenRow(row.note_path);
									} else if (event.key === " ") {
										event.preventDefault();
										onSelectRow(row.note_path);
									}
								}}
								title="Double-click to open note"
							>
								<span
									className="databaseListTitle databaseCellText databaseCellButton is-title"
									title={title}
								>
									{title}
								</span>
								{visibleTags.length > 0 ? (
									<span className="databaseListTags" aria-label="Tags">
										{visibleTags.map((tag) => (
											<span
												key={`${row.note_path}:${tag}`}
												className="databaseCellPill databaseListTag"
												style={databaseValueToneStyle(tag)}
												title={formatDatabaseTagLabel(tag)}
											>
												<HugeiconsIcon
													icon={Tag01Icon}
													className="databaseTagPillIcon"
													size={11}
													strokeWidth={1.2}
												/>
												{formatDatabaseTagLabel(tag)}
											</span>
										))}
										{extraTagCount > 0 ? (
											<span className="databaseCellPill databaseCellPillMore databaseListTag">
												+{extraTagCount}
											</span>
										) : null}
									</span>
								) : null}
								<span
									className="databaseListPath databaseFooterPath"
									title={folderPath}
								>
									{folderPath}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
