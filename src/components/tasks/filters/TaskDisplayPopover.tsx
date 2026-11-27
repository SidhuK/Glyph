import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	ArrowUpDownIcon,
	CheckmarkCircle02Icon,
	KanbanIcon,
	LayerIcon,
	LayoutTwoColumnIcon,
	LeftToRightListBulletIcon,
	SlidersVerticalIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Toggle } from "@/components/base/toggle/toggle";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import { Select } from "@/components/ui/shadcn/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/shadcn/toggle-group";
import {
	TASK_GROUP_BY,
	TASK_LAYOUTS,
	TASK_ORDER_BY,
	type TaskDisplayState,
} from "../model/taskDisplay";

interface TaskDisplayPopoverProps {
	display: TaskDisplayState;
	onChange: (patch: Partial<TaskDisplayState>) => void;
}

const LAYOUT_ICONS = {
	list: LeftToRightListBulletIcon,
	board: KanbanIcon,
} as const satisfies Record<TaskDisplayState["layout"], IconSvgElement>;

function DisplayRow({
	icon,
	label,
	children,
}: {
	icon: IconSvgElement;
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="databaseViewOptionsRow">
			<HugeiconsIcon
				icon={icon}
				size="var(--icon-md)"
				className="databaseViewOptionsRowIcon"
				aria-hidden="true"
			/>
			<span className="databaseViewOptionsRowLabel">{label}</span>
			<div className="databaseViewOptionsRowControl">{children}</div>
		</div>
	);
}

export function TaskDisplayPopover({ display, onChange }: TaskDisplayPopoverProps) {
	const { t } = useTranslation("shell");
	const label = t("tasks.display.label");
	const isBoard = display.layout === "board";
	return (
		<Popover>
			<PopoverTrigger render={<button type="button" className="tasksToolbarButton" />}>
				<HugeiconsIcon icon={SlidersVerticalIcon} size="var(--icon-sm)" aria-hidden="true" />
				<span>{label}</span>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={8}
				className="databaseDisplayPanel tasksDisplayPanel"
				aria-label={label}
				initialFocus={false}
				finalFocus={(closeType) => closeType === "keyboard"}
			>
				<div className="databaseViewOptionsRows">
					<DisplayRow icon={LayoutTwoColumnIcon} label={t("tasks.display.layout")}>
						<ToggleGroup
							className="tasksLayoutToggle"
							aria-label={t("tasks.display.layout")}
							value={display.layout}
							onValueChange={(layout) => onChange({ layout })}
						>
							{TASK_LAYOUTS.map((layout) => (
								<ToggleGroupItem
									key={layout}
									value={layout}
									aria-label={t(`tasks.display.layouts.${layout}`)}
								>
									<HugeiconsIcon
										icon={LAYOUT_ICONS[layout]}
										size="var(--icon-sm)"
										aria-hidden="true"
									/>
									<span>{t(`tasks.display.layouts.${layout}`)}</span>
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</DisplayRow>
					{isBoard ? null : (
						<DisplayRow icon={LayerIcon} label={t("tasks.display.groupBy")}>
							<Select
								className="databaseViewOptionsSelect"
								aria-label={t("tasks.display.groupBy")}
								value={display.groupBy}
								options={TASK_GROUP_BY.map((value) => ({
									value,
									label: t(`tasks.display.groups.${value}`),
								}))}
								onValueChange={(groupBy) => onChange({ groupBy })}
							/>
						</DisplayRow>
					)}
					<DisplayRow icon={ArrowUpDownIcon} label={t("tasks.display.orderBy")}>
						<Select
							className="databaseViewOptionsSelect"
							aria-label={t("tasks.display.orderBy")}
							value={display.orderBy}
							options={TASK_ORDER_BY.map((value) => ({
								value,
								label: t(`tasks.display.orders.${value}`),
							}))}
							onValueChange={(orderBy) => onChange({ orderBy })}
						/>
					</DisplayRow>
					{isBoard ? null : (
						<>
							<DisplayRow icon={LeftToRightListBulletIcon} label={t("tasks.display.showSubtasks")}>
								<Toggle
									size="sm"
									checked={display.showSubtasks}
									ariaLabel={t("tasks.display.showSubtasks")}
									onCheckedChange={(showSubtasks) => onChange({ showSubtasks })}
								/>
							</DisplayRow>
							<DisplayRow icon={CheckmarkCircle02Icon} label={t("tasks.display.includeDone")}>
								<Toggle
									size="sm"
									checked={display.includeDone}
									ariaLabel={t("tasks.display.includeDone")}
									onCheckedChange={(includeDone) => onChange({ includeDone })}
								/>
							</DisplayRow>
						</>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
