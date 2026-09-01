import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Feedback, PointerActivationConstraints } from "@dnd-kit/dom";
import { OptimisticSortingPlugin } from "@dnd-kit/dom/sortable";
import {
	type DragEndEvent,
	PointerSensor,
	useDragDropMonitor,
} from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { DragDropVerticalIcon } from "@hugeicons/core-free-icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
	SidebarOrder,
	SidebarVisibility,
	SidebarVisibilityKey,
} from "../../lib/settings/model";
import { SettingsRow, SettingsToggle } from "./SettingsScaffold";

const SIDEBAR_ITEM_DND_TYPE = "settings-sidebar-item";
const SIDEBAR_ITEM_DND_GROUP = "settings-sidebar-order";

const SIDEBAR_ITEM_SENSORS = [
	PointerSensor.configure({
		activationConstraints: [
			new PointerActivationConstraints.Distance({ value: 5 }),
		],
	}),
];

const SIDEBAR_ITEM_PLUGINS = [
	OptimisticSortingPlugin,
	Feedback.configure({ feedback: "clone" }),
];

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

export function AppearanceSidebarItems({
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
				const next = moveSidebarItem(
					order,
					source.initialIndex,
					source.index,
				);
				if (next) onReorder(next);
			},
		}),
		[disabled, onReorder, order],
	);
	useDragDropMonitor(dragDropHandlers);

	return (
		<>
			{order.map((key, index) => (
				<AppearanceSidebarItem
					key={key}
					itemKey={key}
					index={index}
					visible={visibility[key]}
					disabled={disabled}
					onVisibilityChange={onVisibilityChange}
				/>
			))}
		</>
	);
}

function AppearanceSidebarItem({
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
	const { t } = useTranslation("settings.appearance");
	const label = t(`sidebar.items.${itemKey}.label`);
	const { ref, handleRef, isDragging } = useSortable({
		id: itemKey,
		index,
		group: SIDEBAR_ITEM_DND_GROUP,
		type: SIDEBAR_ITEM_DND_TYPE,
		accept: SIDEBAR_ITEM_DND_TYPE,
		sensors: SIDEBAR_ITEM_SENSORS,
		plugins: SIDEBAR_ITEM_PLUGINS,
		disabled,
		data: { sidebarKey: itemKey },
		transition: { duration: 160, easing: "ease" },
	});
	const reorderLabel = t("sidebar.reorder", { label });

	return (
		<div
			ref={ref}
			className="settingsSidebarItemRow"
			data-dragging={isDragging ? "true" : undefined}
		>
			<SettingsRow
				className="settingsSidebarItemField"
				title={label}
				label={
					<span className="settingsSidebarItemLabel">
						<button
							ref={handleRef}
							type="button"
							className="settingsSidebarDragHandle"
							tabIndex={-1}
							disabled={disabled}
							aria-label={reorderLabel}
							title={reorderLabel}
						>
							<HugeiconsIcon
								icon={DragDropVerticalIcon}
								size="var(--icon-md)"
							/>
						</button>
						{label}
					</span>
				}
				interactive={false}
			>
				<div className="settingsSidebarItemControls">
					<SettingsToggle
						checked={visible}
						disabled={disabled}
						ariaLabel={t("sidebar.showItem", { label })}
						onCheckedChange={(nextVisible) =>
							onVisibilityChange(itemKey, nextVisible)
						}
					/>
				</div>
			</SettingsRow>
		</div>
	);
}
