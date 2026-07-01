export interface SelectedCodeBlockState {
	top: number;
	controlsLeft: number;
	controlsRight: number;
	pos: number;
	language: string | null;
	source: string;
}

export interface SelectedTableState {
	rowControlLeft: number;
	rowControlTop: number;
	columnControlLeft: number;
	columnControlTop: number;
}

export type TableEditorCommand =
	| "addRowBefore"
	| "addRowAfter"
	| "deleteRow"
	| "addColumnBefore"
	| "addColumnAfter"
	| "deleteColumn";

export interface TableInlineControlsProps {
	selected: SelectedTableState;
	onControlMouseDown: (event: React.MouseEvent<HTMLElement>) => void;
	onCommand: (command: TableEditorCommand) => void;
	canDeleteRow: boolean;
	canDeleteColumn: boolean;
}
