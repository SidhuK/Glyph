import { useMemo, useState } from "react";
import { useDatabaseBoard } from "../../hooks/database/useDatabaseBoard";
import {
	boardDropValue,
	boardRowHasLane,
	formatBoardCellValue,
} from "../../lib/database/board";
import { databaseCellValueFromRow } from "../../lib/database/config";
import type { DatabaseColumn, DatabaseRow } from "../../lib/database/types";
import { extractErrorMessage } from "../../lib/errorUtils";
import { formatTagLabel } from "../editor/noteProperties/utils";
import { Button } from "../ui/shadcn/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "../ui/shadcn/context-menu";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";

interface DatabaseBoardProps {
	rows: DatabaseRow[];
	columns: DatabaseColumn[];
	visibleColumns: DatabaseColumn[];
	groupColumnId?: string | null;
	selectedRowPath: string | null;
	onSelectRow: (notePath: string) => void;
	onOpenRow: (notePath: string) => void;
	onOpenColumns: () => void;
	onCreateDefaultGroupField: () => void;
	onGroupColumnIdChange: (groupColumnId: string | null) => void;
	onSaveCell: (
		notePath: string,
		column: DatabaseColumn,
		value: {
			kind: string;
			value_text?: string | null;
			value_bool?: boolean | null;
			value_list: string[];
		},
	) => Promise<void>;
}

function fileTitleFromPath(notePath: string): string {
	const base = notePath.split("/").pop() ?? notePath;
	return base.replace(/\.md$/i, "");
}

function boardCardTitle(row: DatabaseRow, activeLaneLabel: string): string {
	const indexedTitle = row.title.trim();
	const fallbackTitle = fileTitleFromPath(row.note_path).trim();
	if (!indexedTitle) return fallbackTitle;
	if (
		indexedTitle.toLowerCase() === activeLaneLabel.toLowerCase() &&
		fallbackTitle &&
		fallbackTitle.toLowerCase() !== indexedTitle.toLowerCase()
	) {
		return fallbackTitle;
	}
	return indexedTitle;
}

function boardCardPreview(row: DatabaseRow, title: string): string {
	const preview = (row.preview ?? "")
		.replace(/\s+/g, " ")
		.replace(/^[#>*\-\s]+/, "")
		.trim();
	if (!preview) return "";
	if (preview.toLowerCase() === title.toLowerCase()) return "";
	return preview;
}

export function DatabaseBoard({
	rows,
	columns,
	visibleColumns,
	groupColumnId: persistedGroupColumnId,
	selectedRowPath,
	onSelectRow,
	onOpenRow,
	onOpenColumns,
	onCreateDefaultGroupField,
	onGroupColumnIdChange,
	onSaveCell,
}: DatabaseBoardProps) {
	const { groupColumn, groupColumns, lanes } = useDatabaseBoard({
		rows,
		columns,
		initialGroupColumnId: persistedGroupColumnId,
		onGroupColumnIdChange,
	});
	const [draggingRowPath, setDraggingRowPath] = useState<string | null>(null);
	const [dropLaneId, setDropLaneId] = useState<string | null>(null);
	const [moveError, setMoveError] = useState("");
	const showTags = visibleColumns.some((column) => column.id === "tags");

	const cardColumns = useMemo(() => {
		if (!groupColumn) return [];
		return visibleColumns
			.filter(
				(column) =>
					column.id !== "title" &&
					column.id !== "tags" &&
					column.id !== "path" &&
					column.id !== "updated" &&
					column.id !== "created" &&
					column.id !== groupColumn.id,
			)
			.slice(0, 1);
	}, [groupColumn, visibleColumns]);

	const handleLaneDrop = async (notePath: string | null, laneId: string) => {
		if (!notePath || !groupColumn) return;
		const row = rows.find((entry) => entry.note_path === notePath);
		if (!row) return;
		if (boardRowHasLane(row, groupColumn, laneId)) {
			setDraggingRowPath(null);
			setDropLaneId(null);
			return;
		}
		try {
			setMoveError("");
			await onSaveCell(
				row.note_path,
				groupColumn,
				boardDropValue(row, groupColumn, laneId),
			);
		} catch (error) {
			setMoveError(extractErrorMessage(error));
		} finally {
			setDraggingRowPath(null);
			setDropLaneId(null);
		}
	};

	return (
		<div className="databaseBoardShell">
			{moveError ? <div className="databaseBoardError">{moveError}</div> : null}
			{groupColumns.length === 0 ? (
				<div className="databaseBoardEmptyState">
					<div className="databaseBoardEmptyTitle">
						Board view needs a grouping field
					</div>
					<div className="databaseBoardEmptyText">
						Choose how the board should group cards by adding a single-value
						property like status, stage, or done.
					</div>
					<div className="databaseBoardEmptyActions">
						<Button type="button" size="sm" onClick={onCreateDefaultGroupField}>
							Add status field
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={onOpenColumns}
						>
							Open columns
						</Button>
					</div>
				</div>
			) : (
				<div className="databaseBoardScroller">
					{lanes.map((lane) => (
						<div
							key={lane.id}
							className="databaseBoardLane"
							data-active={dropLaneId === lane.id ? "true" : "false"}
							onDragOver={(event) => {
								event.preventDefault();
								event.dataTransfer.dropEffect = "move";
								if (draggingRowPath) {
									setDropLaneId(lane.id);
								}
							}}
							onDragLeave={() => {
								setDropLaneId((current) =>
									current === lane.id ? null : current,
								);
							}}
							onDrop={(event) => {
								event.preventDefault();
								const notePath =
									draggingRowPath ||
									event.dataTransfer.getData("text/plain") ||
									null;
								void handleLaneDrop(notePath, lane.id);
							}}
						>
							<div className="databaseBoardLaneHeader">
								<div className="databaseBoardLaneTitle">{lane.label}</div>
								<div className="databaseBoardLaneCount">{lane.cardCount}</div>
							</div>
							<div className="databaseBoardLaneBody">
								{lane.rows.length > 0 ? (
									lane.rows.map((row) => {
										const title = boardCardTitle(row, lane.label);
										const preview = boardCardPreview(row, title);
										const tags = showTags
											? row.tags.filter(
													(tag) =>
														!(
															groupColumn?.type === "tags" &&
															tag.toLowerCase() === lane.id.toLowerCase()
														),
												)
											: [];
										const otherLanes = lanes.filter(
											(l) =>
												l.id !== lane.id &&
												groupColumn != null &&
												!boardRowHasLane(row, groupColumn, l.id),
										);

										return (
											<ContextMenu key={row.note_path}>
												<ContextMenuTrigger asChild>
													<button
														type="button"
														className="databaseBoardCard"
														data-state={
															row.note_path === selectedRowPath
																? "selected"
																: undefined
														}
														data-dragging={
															row.note_path === draggingRowPath
																? "true"
																: undefined
														}
														draggable
														onDragStart={(event) => {
															event.dataTransfer.effectAllowed = "move";
															event.dataTransfer.setData(
																"text/plain",
																row.note_path,
															);
															setDraggingRowPath(row.note_path);
															setDropLaneId(null);
														}}
														onDragEnd={() => {
															setDraggingRowPath(null);
															setDropLaneId(null);
														}}
														onClick={() => onSelectRow(row.note_path)}
														onDoubleClick={() => onOpenRow(row.note_path)}
														title="Double-click to open note"
													>
														<div className="databaseBoardCardHead">
															<div className="databaseBoardCardTitle">
																{title}
															</div>
															{preview ? (
																<div className="databaseBoardCardPreview">
																	{preview}
																</div>
															) : (
																<div className="databaseBoardCardPreview is-placeholder">
																	No preview yet
																</div>
															)}
														</div>
														{tags.length > 0 ? (
															<div className="databaseBoardCardTags">
																{tags.slice(0, 4).map((tag) => (
																	<span
																		key={`${row.note_path}:${tag}`}
																		className="databaseBoardTag"
																	>
																		{formatTagLabel(tag)}
																	</span>
																))}
															</div>
														) : null}
														{cardColumns.length > 0 ? (
															<div className="databaseBoardCardDetails">
																{cardColumns.map((column) => {
																	const cell = databaseCellValueFromRow(
																		row,
																		column,
																	);
																	const value = formatBoardCellValue(cell);
																	if (!value.trim()) return null;
																	return (
																		<div
																			key={`${row.note_path}:${column.id}`}
																			className="databaseBoardCardDetail"
																		>
																			<span
																				className="databaseBoardCardDetailLabel"
																				title={column.label}
																			>
																				<DatabaseColumnIcon
																					column={column}
																					size={11}
																				/>
																			</span>
																			<span
																				className="databaseBoardCardDetailValue"
																				title={value}
																			>
																				{value}
																			</span>
																		</div>
																	);
																})}
															</div>
														) : null}
														<div
															className="databaseBoardCardPath"
															title={row.note_path}
														>
															{row.note_path}
														</div>
													</button>
												</ContextMenuTrigger>
												<ContextMenuContent className="fileTreeCreateMenu">
													<ContextMenuItem
														className="fileTreeCreateMenuItem"
														onSelect={() => onOpenRow(row.note_path)}
													>
														Open note
													</ContextMenuItem>
													{otherLanes.length > 0 ? (
														<>
															<ContextMenuSeparator className="fileTreeCreateMenuSeparator" />
															<div className="databaseBoardMoveLabel">
																Move to
															</div>
															{otherLanes.map((targetLane) => (
																<ContextMenuItem
																	className="fileTreeCreateMenuItem"
																	key={targetLane.id}
																	onSelect={() =>
																		void handleLaneDrop(
																			row.note_path,
																			targetLane.id,
																		)
																	}
																>
																	{targetLane.label}
																</ContextMenuItem>
															))}
														</>
													) : null}
												</ContextMenuContent>
											</ContextMenu>
										);
									})
								) : (
									<div className="databaseBoardLaneEmpty">
										No notes in this lane
									</div>
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
