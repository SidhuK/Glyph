import type { MouseEvent } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useGalleryCovers } from "../../../hooks/database/useGalleryCovers";
import { useGalleryLayout } from "../../../hooks/database/useGalleryLayout";
import { useTaskSummariesForPaths } from "../../../hooks/useTaskSummariesForPaths";
import { databaseRowTitle } from "../../../lib/database/config";
import type { DatabaseColumn, DatabaseRow } from "../../../lib/database/types";
import { showNativeContextMenu } from "../../../lib/nativeContextMenu";
import type { DatabaseGalleryCardSize, DatabaseGalleryCover } from "../../../lib/tauri";
import type { EditorTextColor } from "../../editor/textColors";
import { DatabaseCardBody, EMPTY_TASK_SUMMARY, useCardTagIconName } from "../DatabaseCardBody";
import { DatabaseGalleryCard } from "./DatabaseGalleryCard";

interface DatabaseGalleryProps {
	databaseId: string;
	viewId: string;
	rows: DatabaseRow[];
	groupColumn: DatabaseColumn | null;
	cover: DatabaseGalleryCover;
	cardSize: DatabaseGalleryCardSize;
	cardFields: string[];
	statusColors: Record<string, EditorTextColor>;
	selectedRowPath: string | null;
	onSelectRow: (notePath: string) => void;
	onOpenRow: (notePath: string) => void;
	hasMoreRows: boolean;
	isLoadingMoreRows: boolean;
	onLoadMoreRows?: () => undefined | Promise<unknown>;
}

export function DatabaseGallery({
	databaseId,
	viewId,
	rows,
	groupColumn,
	cover,
	cardSize,
	cardFields,
	statusColors,
	selectedRowPath,
	onSelectRow,
	onOpenRow,
	hasMoreRows,
	isLoadingMoreRows,
	onLoadMoreRows,
}: DatabaseGalleryProps) {
	const { t } = useTranslation("shell");
	const layout = useGalleryLayout({
		rows,
		groupColumn,
		cardSize,
		hasMore: hasMoreRows,
		isLoadingMore: isLoadingMoreRows,
		onLoadMore: onLoadMoreRows,
	});
	const covers = useGalleryCovers({
		databaseId,
		viewId,
		cover,
		orderedRows: layout.orderedRows,
		visibleRange: layout.visibleRange,
	});
	const iconNameForTag = useCardTagIconName();
	const taskSummaryPaths = useMemo(() => rows.map((row) => row.note_path), [rows]);
	const taskSummariesByPath = useTaskSummariesForPaths(taskSummaryPaths, true);

	const openContextMenu = (event: MouseEvent<HTMLButtonElement>, row: DatabaseRow) => {
		void showNativeContextMenu(event, [
			{ label: t("collections.card.openNote"), action: () => onOpenRow(row.note_path) },
		]).catch((error: unknown) => {
			console.error("Failed to show gallery card context menu", error);
		});
	};

	if (rows.length === 0) {
		return <div className="databaseGalleryEmpty">{t("collections.gallery.empty")}</div>;
	}

	return (
		<div ref={layout.scrollRef} className="databaseGalleryScroller" data-size={cardSize}>
			<div className="databaseGalleryCanvas" style={{ height: layout.virtualizer.getTotalSize() }}>
				{layout.virtualItems.map((item) => {
					const virtualRow = layout.virtualRows[item.index];
					if (!virtualRow) return null;
					return (
						<div
							key={item.key}
							ref={layout.virtualizer.measureElement}
							data-index={item.index}
							className="databaseGalleryVirtualRow"
							style={{ transform: `translateY(${item.start}px)` }}
						>
							{virtualRow.kind === "header" ? (
								<div className="databaseGalleryGroupHeader">
									<span>{virtualRow.label || t("collections.gallery.noValue")}</span>
									<span className="databaseGalleryGroupCount">{virtualRow.count}</span>
								</div>
							) : (
								<div
									className="databaseGalleryRow"
									style={{ gridTemplateColumns: `repeat(${layout.columnCount}, minmax(0, 1fr))` }}
								>
									{virtualRow.rows.map((row) => (
										<DatabaseGalleryCard
											key={row.note_path}
											row={row}
											cover={covers.get(row.note_path) ?? null}
											showCover={cover !== "none"}
											coverHeight={layout.coverHeight}
											selected={row.note_path === selectedRowPath}
											onSelectRow={onSelectRow}
											onOpenRow={onOpenRow}
											onContextMenu={(event) => openContextMenu(event, row)}
										>
											<DatabaseCardBody
												row={row}
												title={databaseRowTitle(row)}
												cardFields={cardFields}
												statusColors={statusColors}
												taskSummary={taskSummariesByPath?.[row.note_path] ?? EMPTY_TASK_SUMMARY}
												iconNameForTag={iconNameForTag}
											/>
										</DatabaseGalleryCard>
									))}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
