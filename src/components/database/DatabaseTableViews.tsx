import { PointerActivationConstraints } from "@dnd-kit/dom";
import {
	KeyboardSensor,
	PointerSensor,
	useDraggable,
	useDroppable,
} from "@dnd-kit/react";
import {
	type CSSProperties,
	type MouseEvent,
	type MutableRefObject,
	type ReactNode,
	useCallback,
} from "react";
import type { DatabaseRow } from "../../lib/database/types";
import { Plus } from "../Icons";

const DATABASE_TABLE_ROW_SENSORS = [
	PointerSensor.configure({
		activationConstraints: [
			new PointerActivationConstraints.Distance({ value: 6 }),
		],
	}),
	KeyboardSensor,
];

const INTERACTIVE_CELL_SELECTOR =
	"button, a, input, textarea, select, [contenteditable='true'], [role='button'], [role='menuitem'], [role='option']";

function isInteractiveTarget(target: EventTarget | null): boolean {
	return (
		target instanceof Element &&
		Boolean(target.closest(INTERACTIVE_CELL_SELECTOR))
	);
}

interface DatabaseTableGroupHeaderProps {
	groupId: string;
	label: string;
	rowCount: number;
	visibleColumnCount: number;
	style: CSSProperties;
	canCreateInGroup: boolean;
	onCreateInGroup?: () => void;
}

export function DatabaseTableGroupHeader({
	groupId,
	label,
	rowCount,
	visibleColumnCount,
	style,
	canCreateInGroup,
	onCreateInGroup,
}: DatabaseTableGroupHeaderProps) {
	const { ref, isDropTarget } = useDroppable({
		id: `group:${groupId}`,
		data: { laneId: groupId },
		accept: "database-table-row",
	});

	return (
		<tr
			ref={ref}
			className="databaseGroupHeaderRow"
			data-drop-target={isDropTarget ? "true" : undefined}
			style={style}
		>
			<td colSpan={visibleColumnCount} className="databaseGroupCell">
				<span className="databaseGroupLabel">{label}</span>
				<span className="databaseGroupCount" aria-label={`${rowCount} notes`}>
					{rowCount}
				</span>
				{canCreateInGroup && onCreateInGroup ? (
					<button
						type="button"
						className="databaseGroupAddButton"
						onClick={onCreateInGroup}
						title={`Add note to ${label}`}
						aria-label={`Add note to ${label}`}
					>
						<Plus size="var(--icon-sm)" strokeWidth={1.5} aria-hidden="true" />
					</button>
				) : null}
			</td>
		</tr>
	);
}

interface DatabaseTableDraggableRowProps {
	row: DatabaseRow;
	groupId: string;
	selected: boolean;
	style: CSSProperties;
	suppressClickRef: MutableRefObject<boolean>;
	onSelectRow: (notePath: string) => void;
	onOpenRow: (notePath: string) => void;
	children: ReactNode;
}

export function DatabaseTableDraggableRow({
	row,
	groupId,
	selected,
	style,
	suppressClickRef,
	onSelectRow,
	onOpenRow,
	children,
}: DatabaseTableDraggableRowProps) {
	const dragId = `${groupId}:${row.note_path}`;
	const { ref: droppableRef, isDropTarget } = useDroppable({
		id: `row:${dragId}`,
		data: { laneId: groupId, notePath: row.note_path },
		accept: "database-table-row",
	});
	const { ref, handleRef, isDragging } = useDraggable({
		id: dragId,
		type: "database-table-row",
		sensors: DATABASE_TABLE_ROW_SENSORS,
		data: { notePath: row.note_path, sourceLaneId: groupId },
	});
	const setRowRef = useCallback(
		(element: HTMLTableRowElement | null) => {
			droppableRef(element);
			ref(element);
			handleRef(element);
		},
		[droppableRef, handleRef, ref],
	);

	const handleClick = useCallback(
		(event: MouseEvent<HTMLTableRowElement>) => {
			if (suppressClickRef.current || isInteractiveTarget(event.target)) return;
			onSelectRow(row.note_path);
		},
		[onSelectRow, row.note_path, suppressClickRef],
	);

	const handleDoubleClick = useCallback(
		(event: MouseEvent<HTMLTableRowElement>) => {
			if (suppressClickRef.current || isInteractiveTarget(event.target)) return;
			onOpenRow(row.note_path);
		},
		[onOpenRow, row.note_path, suppressClickRef],
	);

	return (
		<tr
			ref={setRowRef}
			data-slot="table-row"
			data-state={selected ? "selected" : undefined}
			data-dragging={isDragging ? "true" : undefined}
			data-drop-target={isDropTarget ? "true" : undefined}
			className="databaseRow"
			style={style}
			tabIndex={0}
			onClick={handleClick}
			onDoubleClick={handleDoubleClick}
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					onOpenRow(row.note_path);
				} else if (event.key === " ") {
					event.preventDefault();
					onSelectRow(row.note_path);
				}
			}}
		>
			{children}
		</tr>
	);
}
