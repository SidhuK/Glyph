import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { LocationAdd01Icon } from "@hugeicons/core-free-icons";
import { type MouseEvent, memo, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
	type NativeContextMenuItem,
	isNativeContextMenuAvailable,
	showNativePopupMenu,
} from "../../lib/nativeContextMenu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";
import type {
	TableActionTarget,
	TableEditorAction,
	TableEditorCapabilities,
	TableEditorCommand,
	TableInlineControlsProps,
} from "./noteEditorOverlayTypes";

type TableAxisMenuItem =
	| {
			type: "action";
			label: string;
			command: TableEditorCommand;
			enabled: boolean;
			destructive?: boolean;
	  }
	| { type: "separator"; id: string };

function buildAxisMenuItems(
	labels: {
		addBefore: string;
		addAfter: string;
		moveBefore: string;
		moveAfter: string;
		deleteItem: string;
	},
	commands: {
		addBefore: TableEditorCommand;
		addAfter: TableEditorCommand;
		moveBefore: TableEditorCommand;
		moveAfter: TableEditorCommand;
		deleteItem: TableEditorCommand;
	},
	enabled: {
		moveBefore: boolean;
		moveAfter: boolean;
		deleteItem: boolean;
	},
): TableAxisMenuItem[] {
	return [
		{
			type: "action",
			label: labels.addBefore,
			command: commands.addBefore,
			enabled: true,
		},
		{
			type: "action",
			label: labels.addAfter,
			command: commands.addAfter,
			enabled: true,
		},
		{ type: "separator", id: `${commands.deleteItem}-insert` },
		{
			type: "action",
			label: labels.moveBefore,
			command: commands.moveBefore,
			enabled: enabled.moveBefore,
		},
		{
			type: "action",
			label: labels.moveAfter,
			command: commands.moveAfter,
			enabled: enabled.moveAfter,
		},
		{ type: "separator", id: `${commands.deleteItem}-move` },
		{
			type: "action",
			label: labels.deleteItem,
			command: commands.deleteItem,
			enabled: enabled.deleteItem,
			destructive: true,
		},
	];
}

function toNativeMenuItems(
	items: TableAxisMenuItem[],
	onCommand: (command: TableEditorCommand) => void,
): NativeContextMenuItem[] {
	return items.map((item) => {
		if (item.type === "separator") {
			return { type: "separator" };
		}
		return {
			label: item.label,
			enabled: item.enabled,
			action: () => onCommand(item.command),
		};
	});
}

interface TableAxisControlProps {
	axis: "row" | "column";
	left: number;
	top: number;
	ariaLabel: string;
	menuItems: TableAxisMenuItem[];
	onControlMouseDown: (event: React.MouseEvent<HTMLElement>) => void;
	onCommand: (action: TableEditorAction) => void;
	captureTarget: () => TableActionTarget | null;
	nativeMenusEnabled: boolean;
}

const TableAxisControl = memo(function TableAxisControl({
	axis,
	left,
	top,
	ariaLabel,
	menuItems,
	onControlMouseDown,
	onCommand,
	captureTarget,
	nativeMenusEnabled,
}: TableAxisControlProps) {
	const capturedTargetRef = useRef<TableActionTarget | null>(null);

	const runCapturedCommand = useCallback(
		(command: TableEditorCommand) => {
			const target = capturedTargetRef.current ?? captureTarget();
			if (!target) return;
			onCommand({ kind: command, target });
		},
		[captureTarget, onCommand],
	);

	const handleNativeMenuClick = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			const target = captureTarget();
			capturedTargetRef.current = target;
			if (!target) return;
			const nativeMenuItems = toNativeMenuItems(menuItems, runCapturedCommand);
			void showNativePopupMenu(event, nativeMenuItems).catch(
				(error: unknown) => {
					console.error(`Failed to show table ${axis} menu`, error);
				},
			);
		},
		[axis, captureTarget, menuItems, runCapturedCommand],
	);

	const handleOpenChange = useCallback(
		(open: boolean) => {
			if (open) {
				capturedTargetRef.current = captureTarget();
			}
		},
		[captureTarget],
	);

	const triggerButton = (
		<button
			type="button"
			className={`tableInlineAddBtn is-${axis}`}
			data-axis={axis}
			aria-label={ariaLabel}
			title={ariaLabel}
			style={{
				left: `${left}px`,
				top: `${top}px`,
			}}
			onMouseDown={onControlMouseDown}
			onClick={nativeMenusEnabled ? handleNativeMenuClick : undefined}
		>
			<HugeiconsIcon icon={LocationAdd01Icon} size="var(--icon-md)" />
		</button>
	);

	if (nativeMenusEnabled) {
		return triggerButton;
	}

	return (
		<DropdownMenu onOpenChange={handleOpenChange}>
			<DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
			<DropdownMenuContent className="tableInlineControlsMenu" align="start">
				{menuItems.map((item) => {
					if (item.type === "separator") {
						return <DropdownMenuSeparator key={item.id} />;
					}
					return (
						<DropdownMenuItem
							key={item.command}
							disabled={!item.enabled}
							variant={item.destructive ? "destructive" : "default"}
							onSelect={() => runCapturedCommand(item.command)}
						>
							{item.label}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
});

export const TableInlineControls = memo(function TableInlineControls({
	selected,
	onControlMouseDown,
	onCommand,
	captureTarget,
	capabilities,
}: TableInlineControlsProps) {
	const { t } = useTranslation("editor");
	const nativeMenusEnabled = isNativeContextMenuAvailable();
	const rowMenuItems = useMemo(
		() =>
			buildAxisMenuItems(
				{
					addBefore: t("tableControls.addRowAbove"),
					addAfter: t("tableControls.addRowBelow"),
					moveBefore: t("tableControls.moveRowUp"),
					moveAfter: t("tableControls.moveRowDown"),
					deleteItem: t("tableControls.deleteRow"),
				},
				{
					addBefore: "addRowBefore",
					addAfter: "addRowAfter",
					moveBefore: "moveRowUp",
					moveAfter: "moveRowDown",
					deleteItem: "deleteRow",
				},
				{
					moveBefore: capabilities.canMoveRowUp,
					moveAfter: capabilities.canMoveRowDown,
					deleteItem: capabilities.canDeleteRow,
				},
			),
		[capabilities, t],
	);
	const columnMenuItems = useMemo(
		() =>
			buildAxisMenuItems(
				{
					addBefore: t("tableControls.addColumnLeft"),
					addAfter: t("tableControls.addColumnRight"),
					moveBefore: t("tableControls.moveColumnLeft"),
					moveAfter: t("tableControls.moveColumnRight"),
					deleteItem: t("tableControls.deleteColumn"),
				},
				{
					addBefore: "addColumnBefore",
					addAfter: "addColumnAfter",
					moveBefore: "moveColumnLeft",
					moveAfter: "moveColumnRight",
					deleteItem: "deleteColumn",
				},
				{
					moveBefore: capabilities.canMoveColumnLeft,
					moveAfter: capabilities.canMoveColumnRight,
					deleteItem: capabilities.canDeleteColumn,
				},
			),
		[capabilities, t],
	);

	return (
		<>
			<TableAxisControl
				axis="row"
				left={selected.rowControlLeft}
				top={selected.rowControlTop}
				ariaLabel={t("tableControls.rowOptions")}
				menuItems={rowMenuItems}
				onControlMouseDown={onControlMouseDown}
				onCommand={onCommand}
				captureTarget={captureTarget}
				nativeMenusEnabled={nativeMenusEnabled}
			/>
			<TableAxisControl
				axis="column"
				left={selected.columnControlLeft}
				top={selected.columnControlTop}
				ariaLabel={t("tableControls.columnOptions")}
				menuItems={columnMenuItems}
				onControlMouseDown={onControlMouseDown}
				onCommand={onCommand}
				captureTarget={captureTarget}
				nativeMenusEnabled={nativeMenusEnabled}
			/>
		</>
	);
});
