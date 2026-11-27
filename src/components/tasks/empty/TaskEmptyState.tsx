import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	CheckmarkSquare02Icon,
	FilterIcon,
	Sun03Icon,
	TaskDone01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/shadcn/button";
import type { TaskEmptyVariant } from "../model/taskRows";

interface TaskEmptyStateProps {
	variant: TaskEmptyVariant;
	onSeeAll?: () => void;
	onClearFilters?: () => void;
}

const EMPTY_ICONS = {
	today: Sun03Icon,
	none: CheckmarkSquare02Icon,
	filtered: FilterIcon,
	done: TaskDone01Icon,
} as const satisfies Record<TaskEmptyVariant, IconSvgElement>;

function emptyAction(variant: TaskEmptyVariant, props: TaskEmptyStateProps) {
	switch (variant) {
		case "today":
			return props.onSeeAll
				? ({ labelKey: "tasks.empty.seeAll", onClick: props.onSeeAll } as const)
				: null;
		case "filtered":
			return props.onClearFilters
				? ({ labelKey: "tasks.empty.clearFilters", onClick: props.onClearFilters } as const)
				: null;
		case "none":
		case "done":
			return null;
	}
}

export function TaskEmptyState(props: TaskEmptyStateProps) {
	const { t } = useTranslation("shell");
	const { variant } = props;
	const action = emptyAction(variant, props);
	return (
		<div className="tasksEmpty">
			<span className="tasksEmptyIcon" aria-hidden="true">
				<HugeiconsIcon icon={EMPTY_ICONS[variant]} size="var(--icon-md)" />
			</span>
			<p className="tasksEmptyTitle">{t(`tasks.empty.${variant}.title`)}</p>
			<p className="tasksEmptyBody">{t(`tasks.empty.${variant}.body`)}</p>
			{action ? (
				<Button type="button" variant="outline" size="sm" onClick={action.onClick}>
					{t(action.labelKey)}
				</Button>
			) : null}
		</div>
	);
}
