import { m, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { useDatabaseBoard } from "../../hooks/database/useDatabaseBoard";
import { boardDropValue, boardRowHasLane } from "../../lib/database/board";
import { databaseValueToneStyle } from "../../lib/database/palette";
import {
	databaseCellValueFromRow,
	formatDatabaseDateTime,
} from "../../lib/database/config";
import type { DatabaseColumn, DatabaseRow } from "../../lib/database/types";
import { extractErrorMessage } from "../../lib/errorUtils";
import { parentDir } from "../../utils/path";
import { formatTagLabel } from "../editor/noteProperties/utils";
import { springPresets } from "../ui/animations";
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

function normalizePreview(preview?: string): string {
	return (preview ?? "").replace(/\s+/g, " ").trim();
}

function normalizeComparableText(value: string): string {
	return value
		.toLowerCase()
		.replace(/^#+\s*/g, "")
		.replace(/[*_`~[\]()]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function cardPreviewText(row: DatabaseRow, title: string): string {
	const preview = normalizePreview(row.preview);
	if (!preview) return "";
	const normalizedTitle = normalizeComparableText(title);
	const normalizedPreview = normalizeComparableText(preview);
	if (!normalizedTitle || !normalizedPreview.startsWith(normalizedTitle)) {
		return preview;
	}
	const withoutMarkdownHeading = preview.replace(/^#+\s*/, "").trim();
	const titleIndex = withoutMarkdownHeading
		.toLowerCase()
		.indexOf(title.toLowerCase());
	if (titleIndex !== 0) return preview;
	const remainder = withoutMarkdownHeading
		.slice(title.length)
		.replace(/^[-:.\s]+/, "")
		.trim();
	return remainder;
}

function cardCandidateColumns(
	columns: DatabaseColumn[],
	groupColumnId?: string | null,
): DatabaseColumn[] {
	return columns.filter((column) => {
		if (!column.visible) return false;
		if (column.id === groupColumnId) return false;
		return column.type !== "title" && column.type !== "path";
	});
}

function hasCardValue(row: DatabaseRow, column: DatabaseColumn): boolean {
	const cell = databaseCellValueFromRow(row, column);
	return Boolean(
		cell.value_text?.trim() ||
			cell.value_list.length > 0 ||
			typeof cell.value_bool === "boolean",
	);
}

function formatCardValue(row: DatabaseRow, column: DatabaseColumn): string {
	const cell = databaseCellValueFromRow(row, column);
	if (cell.kind === "checkbox") {
		if (typeof cell.value_bool !== "boolean") return "";
		return cell.value_bool ? "Checked" : "Unchecked";
	}
	if (cell.kind === "datetime") {
		return formatDatabaseDateTime(cell.value_text);
	}
	if (cell.value_list.length > 0) {
		return cell.value_list.join(", ");
	}
	return cell.value_text?.trim() ?? "";
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
	const boardCardColumns = useMemo(
		() =>
			cardCandidateColumns(columns, groupColumn?.id ?? persistedGroupColumnId),
		[columns, groupColumn?.id, persistedGroupColumnId],
	);
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
							style={databaseValueToneStyle(lane.id)}
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
										const preview = cardPreviewText(row, title);
										const maxVisibleTags = 2;
										const visibleTags = row.tags.slice(0, maxVisibleTags);
										const extraTagCount = Math.max(
											row.tags.length - maxVisibleTags,
											0,
										);
										const cardDetails = boardCardColumns
											.filter(
												(column) =>
													column.type !== "tags" && hasCardValue(row, column),
											)
											.slice(0, 1);
										const folderLabel =
											row.folder?.trim() || parentDir(row.note_path) || "/";
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
															<div className="databaseBoardCardHeaderRow">
																<span className="databaseBoardCardTitle">
																	{title}
																</span>
																<span className="databaseBoardCardOpenHint">
																	Open
																</span>
															</div>
															{preview ? (
																<div className="databaseBoardCardPreview">
																	{preview}
																</div>
															) : null}
														</div>
														{visibleTags.length > 0 ? (
															<div className="databaseBoardCardTags">
																{visibleTags.map((tag) => (
																	<span
																		key={`${row.note_path}:${tag}`}
																		className="databaseBoardTag"
																		style={databaseValueToneStyle(tag)}
																		title={formatTagLabel(tag)}
																	>
																		{formatTagLabel(tag)}
																	</span>
																))}
																{extraTagCount > 0 ? (
																	<span
																		className="databaseBoardTag is-muted"
																	>
																		+{extraTagCount}
																	</span>
																) : null}
															</div>
														) : null}
														{cardDetails.length > 0 ? (
															<div className="databaseBoardCardDetails">
																{cardDetails.map((column) => (
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
																				size={12}
																			/>
																		</span>
																		<span
																			className="databaseBoardCardDetailValue"
																			title={`${column.label}: ${formatCardValue(row, column)}`}
																		>
																			{formatCardValue(row, column)}
																		</span>
																	</div>
																))}
															</div>
														) : null}
														<div className="databaseBoardCardFooter">
															<span
																className="databaseBoardCardPath"
																title={folderLabel}
															>
																{folderLabel}
															</span>
															<span className="databaseBoardCardTimestamp">
																{formatDatabaseDateTime(row.updated)}
															</span>
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
