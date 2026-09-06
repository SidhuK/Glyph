import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";
import {
	TableMap,
	isInTable,
	moveTableColumn,
	moveTableRow,
	selectedRect,
} from "@tiptap/pm/tables";
import type {
	TableActionTarget,
	TableEditorAction,
	TableEditorCapabilities,
	TableEditorCommand,
} from "../noteEditorOverlayTypes";

export interface TableEditorSnapshot {
	target: TableActionTarget;
	capabilities: TableEditorCapabilities;
}

export function tableEditorSnapshot(
	state: EditorState,
	canDelete: { column: boolean; row: boolean },
): TableEditorSnapshot | null {
	if (!isInTable(state)) return null;

	const rect = selectedRect(state);
	const rowIndex = rect.top;
	const columnIndex = rect.left;
	return {
		target: {
			tablePos: rect.tableStart - 1,
			rowIndex,
			columnIndex,
		},
		capabilities: {
			canDeleteRow: canDelete.row,
			canDeleteColumn: canDelete.column,
			canMoveRowUp: rowIndex > 1,
			canMoveRowDown: rowIndex > 0 && rowIndex < rect.map.height - 1,
			canMoveColumnLeft: columnIndex > 0,
			canMoveColumnRight: columnIndex < rect.map.width - 1,
		},
	};
}

export function tableSnapshotsEqual(
	a: TableEditorSnapshot | null | undefined,
	b: TableEditorSnapshot | null | undefined,
): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	return (
		a.target.tablePos === b.target.tablePos &&
		a.target.rowIndex === b.target.rowIndex &&
		a.target.columnIndex === b.target.columnIndex &&
		a.capabilities.canDeleteRow === b.capabilities.canDeleteRow &&
		a.capabilities.canDeleteColumn === b.capabilities.canDeleteColumn &&
		a.capabilities.canMoveRowUp === b.capabilities.canMoveRowUp &&
		a.capabilities.canMoveRowDown === b.capabilities.canMoveRowDown &&
		a.capabilities.canMoveColumnLeft === b.capabilities.canMoveColumnLeft &&
		a.capabilities.canMoveColumnRight === b.capabilities.canMoveColumnRight
	);
}

function cellPosition(
	table: ProseMirrorNode,
	tablePos: number,
	rowIndex: number,
	columnIndex: number,
): { cell: ProseMirrorNode; cellPos: number } | null {
	const map = TableMap.get(table);
	if (
		rowIndex < 0 ||
		columnIndex < 0 ||
		rowIndex >= map.height ||
		columnIndex >= map.width
	) {
		return null;
	}
	const relative = map.positionAt(rowIndex, columnIndex, table);
	const cell = table.nodeAt(relative);
	if (!cell) return null;
	return { cell, cellPos: tablePos + 1 + relative };
}

function restoreSelection(
	editor: Editor,
	table: ProseMirrorNode,
	target: TableActionTarget,
): boolean {
	const located = cellPosition(
		table,
		target.tablePos,
		target.rowIndex,
		target.columnIndex,
	);
	if (!located || !editor.view) return false;
	const { from, to } = editor.state.selection;
	if (
		from >= located.cellPos &&
		to <= located.cellPos + located.cell.nodeSize
	) {
		editor.view.focus();
		return true;
	}

	const inner = Math.min(
		located.cellPos + 1,
		located.cellPos + located.cell.nodeSize - 1,
	);
	const selection = TextSelection.near(editor.state.doc.resolve(inner), 1);
	const tr = editor.state.tr.setSelection(selection);
	tr.setMeta("addToHistory", false);
	editor.view.dispatch(tr);
	editor.view.focus();
	return true;
}

function canMove(
	kind: TableEditorCommand,
	table: ProseMirrorNode,
	target: TableActionTarget,
): boolean {
	const map = TableMap.get(table);
	switch (kind) {
		case "moveRowUp":
			return target.rowIndex > 1;
		case "moveRowDown":
			return target.rowIndex > 0 && target.rowIndex < map.height - 1;
		case "moveColumnLeft":
			return target.columnIndex > 0;
		case "moveColumnRight":
			return target.columnIndex < map.width - 1;
		default:
			return true;
	}
}

function runMoveCommand(editor: Editor, action: TableEditorAction): boolean {
	const pos = editor.state.selection.from;
	const dispatch = (tr: Transaction) => {
		editor.view.dispatch(tr);
	};
	switch (action.kind) {
		case "moveRowUp":
			return moveTableRow({
				from: action.target.rowIndex,
				to: action.target.rowIndex - 1,
				select: true,
				pos,
			})(editor.state, dispatch);
		case "moveRowDown":
			return moveTableRow({
				from: action.target.rowIndex,
				to: action.target.rowIndex + 1,
				select: true,
				pos,
			})(editor.state, dispatch);
		case "moveColumnLeft":
			return moveTableColumn({
				from: action.target.columnIndex,
				to: action.target.columnIndex - 1,
				select: true,
				pos,
			})(editor.state, dispatch);
		case "moveColumnRight":
			return moveTableColumn({
				from: action.target.columnIndex,
				to: action.target.columnIndex + 1,
				select: true,
				pos,
			})(editor.state, dispatch);
		default:
			return false;
	}
}

export function runTableEditorAction(
	editor: Editor,
	action: TableEditorAction,
): boolean {
	if (editor.isDestroyed) return false;

	const doc = editor.state?.doc;
	const node = doc?.nodeAt(action.target.tablePos);
	const table = node?.type.name === "table" ? node : null;
	if (doc && !table) return false;
	if (table) {
		if (!canMove(action.kind, table, action.target)) return false;
		if (!restoreSelection(editor, table, action.target)) return false;
	}

	switch (action.kind) {
		case "addRowBefore":
		case "addRowAfter":
		case "deleteRow":
		case "addColumnBefore":
		case "addColumnAfter":
		case "deleteColumn":
			return editor
				.chain()
				.focus(null, { scrollIntoView: false })
				[action.kind]()
				.run();
		case "moveRowUp":
		case "moveRowDown":
		case "moveColumnLeft":
		case "moveColumnRight":
			return table ? runMoveCommand(editor, action) : false;
		default: {
			const _exhaustive: never = action.kind;
			return _exhaustive;
		}
	}
}
