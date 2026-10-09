import { useVirtualizer } from "@tanstack/react-virtual";
import { useState } from "react";
import type { CssVars } from "../../lib/utils";
import { TaskHeadingRow, TaskItemRow, TaskNoteRow, type TaskRowContext } from "./TaskRowViews";
import type { TaskRow } from "./buildTaskRows";

/** Narrowest fraction column, in `ch` (fits "0/1"). */
const MIN_FRACTION_CH = 3;

const ROW_ESTIMATES = { note: 48, heading: 26, task: 28 } satisfies Record<TaskRow["kind"], number>;

interface TasksListProps {
	rows: TaskRow[];
	/** Widest fraction label, so every progress bar sits at the same offset. */
	fractionWidth: number;
	paneElement: HTMLElement | null;
	context: TaskRowContext;
}

export function TasksList({ rows, fractionWidth, paneElement, context }: TasksListProps) {
	const [listElement, setListElement] = useState<HTMLDivElement | null>(null);
	const virtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
		count: rows.length,
		estimateSize: (index) => ROW_ESTIMATES[rows[index]?.kind ?? "task"],
		getItemKey: (index) => rows[index]?.id ?? index,
		getScrollElement: () => paneElement,
		// The list sits below the header and toolbar inside the scrolling pane.
		scrollMargin: listElement?.offsetTop ?? 0,
		overscan: 8,
	});

	const listStyle: CssVars<"--tasks-fraction-width"> = {
		height: `${virtualizer.getTotalSize()}px`,
		"--tasks-fraction-width": `${Math.max(MIN_FRACTION_CH, fractionWidth)}ch`,
	};

	return (
		<div
			ref={setListElement}
			role="list"
			className="activityFeed is-virtualized tasksList"
			style={listStyle}
		>
			{virtualizer.getVirtualItems().map((virtualRow) => {
				const row = rows[virtualRow.index];
				if (!row) return null;
				return (
					<div
						key={row.id}
						role="listitem"
						data-index={virtualRow.index}
						ref={(node) => virtualizer.measureElement(node)}
						className="activityVirtualRow"
						data-kind={row.kind}
						style={{
							transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
						}}
					>
						{renderRow(row, context)}
					</div>
				);
			})}
		</div>
	);
}

function renderRow(row: TaskRow, context: TaskRowContext) {
	switch (row.kind) {
		case "note":
			return <TaskNoteRow row={row} context={context} />;
		case "heading":
			return <TaskHeadingRow text={row.text} />;
		case "task":
			return <TaskItemRow row={row} context={context} />;
		default: {
			const _exhaustive: never = row;
			return _exhaustive;
		}
	}
}
