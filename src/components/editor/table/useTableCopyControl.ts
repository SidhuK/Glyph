import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { type MouseEvent as ReactMouseEvent, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "../../../lib/toast";
import { getMountedEditorContentRoot, getOffsetWithinAncestor } from "../hooks/editorDomUtils";
import { type TableCopyFormat, copyTableToClipboard } from "./tableClipboard";

/** Keeps the control alive while the pointer crosses the gap above the table to reach it. */
const TABLE_COPY_HOVER_SLOP_PX = 36;
/** Matches the column control in useTableInlineControls so both sit on one line. */
const TABLE_COPY_CONTROL_OFFSET_PX = 20;
const TABLE_COPY_CONTROL_EDGE_PADDING_PX = 10;

interface HoveredTable {
	element: HTMLElement;
	right: number;
	top: number;
}

export interface TableCopyControlProps {
	right: number;
	top: number;
	onCopy: (format: TableCopyFormat) => void;
	onMenuOpenChange: (open: boolean) => void;
}

function tableElementAt(target: EventTarget, host: HTMLElement): HTMLElement | null {
	if (!(target instanceof Element)) return null;
	const table = target.closest("table");
	const contentRoot = getMountedEditorContentRoot(host);
	return table instanceof HTMLElement && contentRoot?.contains(table) ? table : null;
}

function isNearTable(table: HTMLElement, event: ReactMouseEvent): boolean {
	const rect = table.getBoundingClientRect();
	return (
		event.clientX >= rect.left &&
		event.clientX <= rect.right &&
		event.clientY >= rect.top - TABLE_COPY_HOVER_SLOP_PX &&
		event.clientY <= rect.bottom
	);
}

function tableNodeForElement(editor: Editor, element: HTMLElement): ProseMirrorNode | null {
	const cell = element.querySelector("td, th");
	if (!element.isConnected || !(cell instanceof HTMLElement)) return null;
	const $pos = editor.state.doc.resolve(editor.view.posAtDOM(cell, 0));
	for (let depth = $pos.depth; depth > 0; depth--) {
		const node = $pos.node(depth);
		if (node.type.name === "table") return node;
	}
	return null;
}

/** Hover-revealed copy control for rich-mode tables. */
export function useTableCopyControl(editor: Editor | null, enabled: boolean) {
	const { t } = useTranslation("editor");
	const [hovered, setHovered] = useState<HoveredTable | null>(null);
	const [menuOpen, setMenuOpen] = useState(false);

	const onHostMouseMove = useCallback(
		(event: ReactMouseEvent<HTMLDivElement>) => {
			// Menu items render in a portal, but their events still bubble here.
			if (menuOpen) return;
			const host = event.currentTarget;
			const element = enabled ? tableElementAt(event.target, host) : null;
			if (!element) {
				setHovered((current) => (current && isNearTable(current.element, event) ? current : null));
				return;
			}
			const offset = getOffsetWithinAncestor(element, host);
			const next = {
				element,
				right: offset.left + element.offsetWidth,
				top: Math.max(
					TABLE_COPY_CONTROL_EDGE_PADDING_PX,
					offset.top - TABLE_COPY_CONTROL_OFFSET_PX,
				),
			};
			setHovered((current) =>
				current?.element === next.element &&
				current.right === next.right &&
				current.top === next.top
					? current
					: next,
			);
		},
		[enabled, menuOpen],
	);

	const onHostMouseLeave = useCallback(() => {
		if (!menuOpen) setHovered(null);
	}, [menuOpen]);

	const onMenuOpenChange = useCallback((open: boolean) => {
		setMenuOpen(open);
		if (!open) setHovered(null);
	}, []);

	const onCopy = useCallback(
		(format: TableCopyFormat) => {
			const element = hovered?.element;
			let copied: Promise<void>;
			try {
				const table =
					editor && !editor.isDestroyed && element ? tableNodeForElement(editor, element) : null;
				copied =
					editor && table
						? copyTableToClipboard(editor, table, format)
						: Promise.reject(new Error("The hovered table is no longer in the document."));
			} catch (error) {
				copied = Promise.reject(error);
			}
			void copied.then(
				() => toast.success(t("tableControls.copied")),
				(error: unknown) => {
					console.error("Failed to copy table.", error);
					toast.error(t("tableControls.copyFailed"));
				},
			);
		},
		[editor, hovered, t],
	);

	const control = useMemo((): TableCopyControlProps | null => {
		if (!enabled || !hovered) return null;
		return { right: hovered.right, top: hovered.top, onCopy, onMenuOpenChange };
	}, [enabled, hovered, onCopy, onMenuOpenChange]);

	return { control, onHostMouseMove, onHostMouseLeave };
}
