import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
	type MouseEvent as ReactMouseEvent,
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "../../../lib/toast";
import type {
	SelectedTableState,
	TableActionTarget,
	TableEditorAction,
	TableInlineControlsProps,
} from "../noteEditorOverlayTypes";
import { DISABLED_TABLE_CAPABILITIES } from "../noteEditorOverlayTypes";
import type { NoteInlineEditorMode } from "../types";
import {
	getMountedEditorContentRoot,
	getOffsetWithinAncestor,
} from "./editorDomUtils";
import {
	runTableEditorAction,
	tableEditorSnapshot,
	tableSnapshotsEqual,
} from "./tableEditorCommands";

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
}: UseTableInlineControlsArgs): TableInlineControlsProps | null {
	const { t } = useTranslation("editor");
	const syncRafRef = useRef<number | null>(null);
	const [selectedTable, setSelectedTable] = useState<SelectedTableState | null>(
		null,
	);

	const snapshot = useEditorState({
		editor,
		selector: ({ editor: instance }) => {
			if (!instance || instance.isDestroyed || mode !== "rich" || !canEdit) {
				return null;
			}
			return tableEditorSnapshot(instance.state, {
				column: instance.can().deleteColumn(),
				row: instance.can().deleteRow(),
			});
		},
		equalityFn: tableSnapshotsEqual,
	});

	const onControlMouseDown = useCallback(
		(event: ReactMouseEvent<HTMLElement>) => {
			event.preventDefault();
		},
		[],
	);
	const captureTarget = useCallback((): TableActionTarget | null => {
		return snapshot?.target ?? null;
	}, [snapshot]);
	const onCommand = useCallback(
		(action: TableEditorAction) => {
			if (!editor || editor.isDestroyed) return;
			if (!runTableEditorAction(editor, action)) {
				toast.error(t("tableControls.unavailable"));
			}
		},
		[editor, t],
	);

	useEffect(() => {
		const clearSelectedTable = () => {
			setSelectedTable(null);
		};
		if (!editor || editor.isDestroyed || mode !== "rich" || !canEdit) {
			clearSelectedTable();
			return;
		}
		const host = hostRef.current;
		const contentRoot = getMountedEditorContentRoot(host);
		if (!host || !contentRoot) return;

		const syncSelectedTable = () => {
			if (editor.isDestroyed) {
				clearSelectedTable();
				return;
			}
			const selection = window.getSelection();
			const anchorElement =
				selection?.anchorNode instanceof HTMLElement
					? selection.anchorNode
					: selection?.anchorNode?.parentElement;

			if (!anchorElement || !contentRoot.contains(anchorElement)) {
				setSelectedTable(null);
				return;
			}

			const closestCell = anchorElement.closest("td, th");
			const activeCell =
				closestCell instanceof HTMLElement ? closestCell : null;
			if (!activeCell || !contentRoot.contains(activeCell)) {
				setSelectedTable(null);
				return;
			}

			const closestRow = activeCell.closest("tr");
			const closestTable = activeCell.closest("table");
			const activeRow = closestRow instanceof HTMLElement ? closestRow : null;
			const activeTable =
				closestTable instanceof HTMLElement ? closestTable : null;
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
		editor.on("destroy", clearSelectedTable);
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
			editor.off("destroy", clearSelectedTable);
		};
	}, [canEdit, editor, hostRef, mode]);

	return useMemo(() => {
		if (!selectedTable) return null;
		return {
			selected: selectedTable,
			onControlMouseDown,
			onCommand,
			captureTarget,
			capabilities: snapshot?.capabilities ?? DISABLED_TABLE_CAPABILITIES,
		};
	}, [captureTarget, onCommand, onControlMouseDown, selectedTable, snapshot]);
}
