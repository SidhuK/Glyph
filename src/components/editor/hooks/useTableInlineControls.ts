import type { Editor } from "@tiptap/core";
import { type RefObject, useEffect, useRef, useState } from "react";
import type { SelectedTableState } from "../noteEditorOverlayTypes";
import type { NoteInlineEditorMode } from "../types";
import {
	getMountedEditorContentRoot,
	getOffsetWithinAncestor,
} from "./editorDomUtils";

const TABLE_INLINE_CONTROL_OFFSET_PX = 20;
const TABLE_INLINE_CONTROL_EDGE_PADDING_PX = 10;

interface UseTableInlineControlsArgs {
	canEdit: boolean;
	editor: Editor | null;
	hostRef: RefObject<HTMLDivElement | null>;
	mode: NoteInlineEditorMode;
}

export function useTableInlineControls({
	canEdit,
	editor,
	hostRef,
	mode,
}: UseTableInlineControlsArgs): SelectedTableState | null {
	const syncRafRef = useRef<number | null>(null);
	const [selectedTable, setSelectedTable] = useState<SelectedTableState | null>(
		null,
	);

	useEffect(() => {
		if (!editor || mode !== "rich" || !canEdit) {
			setSelectedTable(null);
			return;
		}
		const host = hostRef.current;
		const contentRoot = getMountedEditorContentRoot(host);
		if (!host || !contentRoot) return;

		const syncSelectedTable = () => {
			const selection = window.getSelection();
			const anchorElement =
				selection?.anchorNode instanceof HTMLElement
					? selection.anchorNode
					: selection?.anchorNode?.parentElement;

			if (!anchorElement || !contentRoot.contains(anchorElement)) {
				setSelectedTable(null);
				return;
			}

			const activeCell = anchorElement.closest("td, th") as HTMLElement | null;
			if (!activeCell || !contentRoot.contains(activeCell)) {
				setSelectedTable(null);
				return;
			}

			const activeRow = activeCell.closest("tr") as HTMLElement | null;
			const activeTable = activeCell.closest("table") as HTMLElement | null;
			if (!activeRow || !activeTable || !contentRoot.contains(activeTable)) {
				setSelectedTable(null);
				return;
			}

			const rowOffset = getOffsetWithinAncestor(activeRow, host);
			const cellOffset = getOffsetWithinAncestor(activeCell, host);
			const tableOffset = getOffsetWithinAncestor(activeTable, host);
			const nextState: SelectedTableState = {
				rowControlLeft: Math.max(
					TABLE_INLINE_CONTROL_EDGE_PADDING_PX,
					tableOffset.left - TABLE_INLINE_CONTROL_OFFSET_PX,
				),
				rowControlTop: rowOffset.top + activeRow.offsetHeight / 2,
				columnControlLeft: cellOffset.left + activeCell.offsetWidth / 2,
				columnControlTop: Math.max(
					TABLE_INLINE_CONTROL_EDGE_PADDING_PX,
					tableOffset.top - TABLE_INLINE_CONTROL_OFFSET_PX,
				),
			};

			setSelectedTable((current) => {
				if (
					current &&
					current.rowControlLeft === nextState.rowControlLeft &&
					current.rowControlTop === nextState.rowControlTop &&
					current.columnControlLeft === nextState.columnControlLeft &&
					current.columnControlTop === nextState.columnControlTop
				) {
					return current;
				}
				return nextState;
			});
		};

		const scheduleSyncSelectedTable = () => {
			if (syncRafRef.current !== null) return;
			syncRafRef.current = window.requestAnimationFrame(() => {
				syncRafRef.current = null;
				syncSelectedTable();
			});
		};

		scheduleSyncSelectedTable();
		const scrollHost = host.closest(".rfNodeNoteEditorBody");
		scrollHost?.addEventListener("scroll", scheduleSyncSelectedTable, {
			passive: true,
		});
		window.addEventListener("resize", scheduleSyncSelectedTable);
		document.addEventListener("selectionchange", scheduleSyncSelectedTable);
		editor.on("selectionUpdate", scheduleSyncSelectedTable);
		editor.on("transaction", scheduleSyncSelectedTable);
		return () => {
			if (syncRafRef.current !== null) {
				window.cancelAnimationFrame(syncRafRef.current);
				syncRafRef.current = null;
			}
			scrollHost?.removeEventListener("scroll", scheduleSyncSelectedTable);
			window.removeEventListener("resize", scheduleSyncSelectedTable);
			document.removeEventListener(
				"selectionchange",
				scheduleSyncSelectedTable,
			);
			editor.off("selectionUpdate", scheduleSyncSelectedTable);
			editor.off("transaction", scheduleSyncSelectedTable);
		};
	}, [canEdit, editor, hostRef, mode]);

	return selectedTable;
}
