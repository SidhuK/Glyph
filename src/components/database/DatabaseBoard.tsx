import { m, useReducedMotion } from "motion/react";
import { useState } from "react";
import { useDatabaseBoard } from "../../hooks/database/useDatabaseBoard";
import { boardDropValue, boardRowHasLane } from "../../lib/database/board";
import type { DatabaseColumn, DatabaseRow } from "../../lib/database/types";
import { extractErrorMessage } from "../../lib/errorUtils";
import { springPresets } from "../ui/animations";
import { Button } from "../ui/shadcn/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "../ui/shadcn/context-menu";

interface DatabaseBoardProps {
	rows: DatabaseRow[];
	columns: DatabaseColumn[];
	groupColumnId?: string | null;
	selectedRowPath: string | null;
	onSelectRow: (notePath: string) => void;
	onOpenRow: (notePath: string) => void;
	onOpenColumns: () => void;
	onCreateDefaultGroupField?: (() => void) | null;
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

export function DatabaseBoard({
	rows,
	columns,
	groupColumnId: persistedGroupColumnId,
	selectedRowPath,
	onSelectRow,
	onOpenRow,
	onOpenColumns,
	onCreateDefaultGroupField,
	onGroupColumnIdChange,
	onSaveCell,
}: DatabaseBoardProps) {
	const shouldReduceMotion = useReducedMotion();
	const { groupColumn, groupColumns, lanes } = useDatabaseBoard({
		rows,
		columns,
		initialGroupColumnId: persistedGroupColumnId,
		onGroupColumnIdChange,
	});
	const [draggingRowPath, setDraggingRowPath] = useState<string | null>(null);
	const [dropLaneId, setDropLaneId] = useState<string | null>(null);
	const [moveError, setMoveError] = useState("");

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
			{moveError ? (
				<m.div
					className="databaseBoardError"
					initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					transition={
						shouldReduceMotion ? { duration: 0 } : springPresets.snappy
					}
				>
					{moveError}
				</m.div>
			) : null}
			{groupColumns.length === 0 ? (
				<m.div
					className="databaseBoardEmptyState"
					initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={
						shouldReduceMotion ? { duration: 0 } : springPresets.snappy
					}
				>
					<div className="databaseBoardEmptyTitle">
						Board view needs a grouping field
					</div>
					<div className="databaseBoardEmptyText">
						Choose how the board should group cards by adding a single-value
						property like status, stage, or done.
					</div>
					<div className="databaseBoardEmptyActions">
						{onCreateDefaultGroupField ? (
							<Button
								type="button"
								size="sm"
								onClick={onCreateDefaultGroupField}
							>
								Add status field
							</Button>
						) : null}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={onOpenColumns}
						>
							Open columns
						</Button>
					</div>
				</m.div>
			) : (
				<div className="databaseBoardScroller">
					{lanes.map((lane, laneIndex) => (
						<m.div
							key={lane.id}
							className="databaseBoardLane"
							data-active={dropLaneId === lane.id ? "true" : "false"}
							initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
							animate={{ opacity: 1, y: 0 }}
							transition={
								shouldReduceMotion
									? { duration: 0 }
									: {
											...springPresets.snappy,
											delay: Math.min(laneIndex * 0.04, 0.18),
										}
							}
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
								<div className="databaseBoardLaneTitleGroup">
									<span className="databaseBoardLaneDot" />
									<div className="databaseBoardLaneTitle">{lane.label}</div>
								</div>
								<div className="databaseBoardLaneCount">{lane.cardCount}</div>
							</div>
							<div className="databaseBoardLaneBody">
								{lane.rows.length > 0 ? (
									lane.rows.map((row) => {
										const title = boardCardTitle(row, lane.label);
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
														<span className="databaseBoardCardTitle">
															{title}
														</span>
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
									<div className="databaseBoardLaneEmptyCard">No notes</div>
								)}
							</div>
						</m.div>
					))}
				</div>
			)}
		</div>
	);
}
