import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { useSpace, useUILayoutContext } from "@/contexts";
import { allDocsCountQueryOptions, formatAllDocsCountLabel } from "@/lib/navigationPrefetch";
import type { SidebarOrder, SidebarVisibilityKey } from "@/lib/settings/model";
import { useQuery } from "@tanstack/react-query";
import {
	Children,
	type ComponentProps,
	type HTMLAttributes,
	type ReactNode,
	isValidElement,
} from "react";

export function AllNotesCountBadge({ inbox = false }: { inbox?: boolean }) {
	const { spacePath } = useSpace();
	const { defaultNewNoteFolder, settingsSpacePath } = useUILayoutContext();
	const enabled = !inbox || Boolean(defaultNewNoteFolder && settingsSpacePath === spacePath);
	const count = useQuery({
		...allDocsCountQueryOptions(inbox ? defaultNewNoteFolder : null),
		enabled,
	});
	const label = formatAllDocsCountLabel(count.data ?? 0);
	return enabled && label ? <span className="sidebarQuickActionCount">{label}</span> : null;
}

interface SidebarActionButtonProps extends Pick<
	HTMLAttributes<HTMLButtonElement>,
	"onFocus" | "onMouseEnter" | "onMouseLeave"
> {
	icon: ComponentProps<typeof HugeiconsIcon>["icon"];
	label: string;
	onClick: () => void;
	disabled?: boolean;
	active?: boolean;
	"data-sidebar-key"?: SidebarVisibilityKey;
	badge?: ReactNode;
}

/** One nav row. In the rail only its icon shows; the native title names it on hover. */
export function SidebarActionButton({
	icon,
	label,
	onClick,
	disabled,
	active,
	"data-sidebar-key": sidebarKey,
	badge,
	...handlers
}: SidebarActionButtonProps) {
	return (
		<button
			type="button"
			className="sidebarQuickActionBtn sidebarNavBtn"
			data-sidebar-key={sidebarKey}
			data-active={active ? "true" : undefined}
			aria-label={label}
			aria-pressed={active}
			aria-current={active ? "page" : undefined}
			onClick={onClick}
			disabled={disabled}
			title={label}
			{...handlers}
		>
			<HugeiconsIcon icon={icon} size="var(--sidebar-icon-size, var(--icon-lg))" />
			<span className="sidebarQuickActionLabel">{label}</span>
			{badge}
		</button>
	);
}

export function OrderedSidebarItems({
	children,
	order,
}: {
	children: ReactNode;
	order: SidebarOrder;
}) {
	return Children.toArray(children).sort((left, right) => {
		if (
			!isValidElement<{ "data-sidebar-key": SidebarVisibilityKey }>(left) ||
			!isValidElement<{ "data-sidebar-key": SidebarVisibilityKey }>(right)
		)
			return 0;
		return (
			order.indexOf(left.props["data-sidebar-key"]) - order.indexOf(right.props["data-sidebar-key"])
		);
	});
}
