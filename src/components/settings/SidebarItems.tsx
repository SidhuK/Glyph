import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Feedback, PointerActivationConstraints } from "@dnd-kit/dom";
import { OptimisticSortingPlugin } from "@dnd-kit/dom/sortable";
import { type DragEndEvent, PointerSensor, useDragDropMonitor } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { DragDropVerticalIcon } from "@hugeicons/core-free-icons";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
	SidebarOrder,
	SidebarVisibility,
	SidebarVisibilityKey,
} from "../../lib/settings/model";
import { SettingsRow, SettingsToggle } from "./SettingsScaffold";
import { SidebarCalendarOptions } from "./SidebarCalendarOptions";

const SIDEBAR_ITEM_DND_TYPE = "settings-sidebar-item";
const SIDEBAR_ITEM_DND_GROUP = "settings-sidebar-order";

const SIDEBAR_ITEM_SENSORS = [
	PointerSensor.configure({
		activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })],
	}),
];

const SIDEBAR_ITEM_PLUGINS = [OptimisticSortingPlugin, Feedback.configure({ feedback: "clone" })];

function moveSidebarItem(
	order: SidebarOrder,
	fromIndex: number,
	toIndex: number,
): SidebarOrder | null {
	if (
		fromIndex === toIndex ||
		fromIndex < 0 ||
		toIndex < 0 ||
		fromIndex >= order.length ||
		toIndex >= order.length
	) {
		return null;
	}
	const next = [...order];
	const [moved] = next.splice(fromIndex, 1);
	if (!moved) return null;
	next.splice(toIndex, 0, moved);
	return next;
}

/** Calendar is pinned below the file tree, so it is not part of the reorderable list. */
function visibleSidebarOrder(order: SidebarOrder): SidebarOrder {
	return order.filter((key) => key !== "newCanvas" && key !== "calendar");
}

function restoreCombinedSidebarOrder(order: SidebarOrder): SidebarOrder {
	const newNoteIndex = order.indexOf("newNote");
	if (newNoteIndex < 0) return [...order, "newNote", "newCanvas"];
	return [...order.slice(0, newNoteIndex + 1), "newCanvas", ...order.slice(newNoteIndex + 1)];
}

export function SidebarItems({
	order,
	visibility,
	disabled,
	onReorder,
	onVisibilityChange,
}: {
	order: SidebarOrder;
	visibility: SidebarVisibility;
	disabled: boolean;
	onReorder: (next: SidebarOrder) => void;
	onVisibilityChange: (key: SidebarVisibilityKey, visible: boolean) => void;
}) {
	const { t } = useTranslation("settings.sidebar");
	const visibleOrder = useMemo(() => visibleSidebarOrder(order), [order]);
	const dragDropHandlers = useMemo(
		() => ({
			onDragEnd(event: DragEndEvent) {
				const { source } = event.operation;
				if (
					event.canceled ||
					disabled ||
					!isSortable(source) ||
					source.type !== SIDEBAR_ITEM_DND_TYPE
				) {
					return;
				}
				const next = moveSidebarItem(visibleOrder, source.initialIndex, source.index);
				if (next) onReorder(restoreCombinedSidebarOrder(next));
			},
		}),
		[visibleOrder, disabled, onReorder],
	);
	useDragDropMonitor(dragDropHandlers);

	return (
		<>
			{visibleOrder.map((key, index) => (
				<SidebarItem
					key={key}
					itemKey={key}
					index={index}
					visible={key === "newNote" ? visibility.newNote || visibility.newCanvas : visibility[key]}
					disabled={disabled}
					onVisibilityChange={onVisibilityChange}
				/>
			))}
			<SidebarItemRow
				itemKey="calendar"
				label={t("items.calendar.label")}
				searchId="sidebar-calendar"
				visible={visibility.calendar}
				disabled={disabled}
				onVisibilityChange={onVisibilityChange}
			>
				{visibility.calendar ? <SidebarCalendarOptions disabled={disabled} /> : null}
			</SidebarItemRow>
		</>
	);
}

function SidebarItem({
	itemKey,
	index,
	visible,
	disabled,
	onVisibilityChange,
}: {
	itemKey: SidebarVisibilityKey;
	index: number;
	visible: boolean;
	disabled: boolean;
	onVisibilityChange: (key: SidebarVisibilityKey, visible: boolean) => void;
}) {
	const { t } = useTranslation("settings.sidebar");
	const label = t(
		itemKey === "newNote" ? "items.newNoteAndCanvas.label" : `items.${itemKey}.label`,
	);
	const { ref, handleRef, isDragging } = useSortable({
		id: itemKey,
		index,
		group: SIDEBAR_ITEM_DND_GROUP,
		type: SIDEBAR_ITEM_DND_TYPE,
		accept: SIDEBAR_ITEM_DND_TYPE,
		sensors: SIDEBAR_ITEM_SENSORS,
		plugins: SIDEBAR_ITEM_PLUGINS,
		disabled,
		transition: { duration: 160, easing: "ease" },
	});
	const reorderLabel = t("reorder", { label });

	return (
		<SidebarItemRow
			rowRef={ref}
			isDragging={isDragging}
			itemKey={itemKey}
			label={label}
			visible={visible}
			disabled={disabled}
			onVisibilityChange={onVisibilityChange}
			handle={
				<button
					ref={handleRef}
					type="button"
					className="settingsSidebarDragHandle"
					tabIndex={-1}
					disabled={disabled}
					aria-label={reorderLabel}
					title={reorderLabel}
				>
					<HugeiconsIcon icon={DragDropVerticalIcon} size="var(--icon-sm)" />
				</button>
			}
		/>
	);
}

function SidebarItemRow({
	rowRef,
	isDragging = false,
	itemKey,
	label,
	visible,
	disabled,
	onVisibilityChange,
	handle,
	searchId,
	children,
}: {
	rowRef?: (element: Element | null) => void;
	isDragging?: boolean;
	itemKey: SidebarVisibilityKey;
	label: string;
	visible: boolean;
	disabled: boolean;
	onVisibilityChange: (key: SidebarVisibilityKey, visible: boolean) => void;
	handle?: ReactNode;
	searchId?: string;
	children?: ReactNode;
}) {
	const { t } = useTranslation("settings.sidebar");

	return (
		<div
			ref={rowRef}
			className="settingsSidebarItemRow"
			data-dragging={isDragging ? "true" : undefined}
		>
			<SettingsRow
				className="settingsSidebarItemField"
				title={label}
				searchId={searchId}
				label={
					<span className="settingsSidebarItemLabel">
						{handle}
						{label}
					</span>
				}
				interactive={false}
			>
				<div className="settingsSidebarItemControls">
					<SettingsToggle
						checked={visible}
						disabled={disabled}
						ariaLabel={t("showItem", { label })}
						onCheckedChange={(nextVisible) => onVisibilityChange(itemKey, nextVisible)}
					/>
				</div>
			</SettingsRow>
			{children}
		</div>
	);
}
