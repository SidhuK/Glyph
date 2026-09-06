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
	| "deleteColumn"
	| "moveRowUp"
	| "moveRowDown"
	| "moveColumnLeft"
	| "moveColumnRight";

export interface TableActionTarget {
	tablePos: number;
	rowIndex: number;
	columnIndex: number;
}

export interface TableEditorAction {
	kind: TableEditorCommand;
	target: TableActionTarget;
}

export interface TableEditorCapabilities {
	canDeleteRow: boolean;
	canDeleteColumn: boolean;
	canMoveRowUp: boolean;
	canMoveRowDown: boolean;
	canMoveColumnLeft: boolean;
	canMoveColumnRight: boolean;
}

export const DISABLED_TABLE_CAPABILITIES: TableEditorCapabilities = {
	canDeleteRow: false,
	canDeleteColumn: false,
	canMoveRowUp: false,
	canMoveRowDown: false,
	canMoveColumnLeft: false,
	canMoveColumnRight: false,
};

export interface TableInlineControlsProps {
	selected: SelectedTableState;
	onControlMouseDown: (event: React.MouseEvent<HTMLElement>) => void;
	onCommand: (action: TableEditorAction) => void;
	captureTarget: () => TableActionTarget | null;
	capabilities: TableEditorCapabilities;
}
