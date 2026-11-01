import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuItemCheck,
	DropdownMenuItemIcon,
	DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { RibbonIcon, preventMouseDown, refocusEditorOnDismiss } from "./RibbonButton";
import type {
	RibbonButtonConfig,
	RibbonCommandContext,
	RibbonMenuConfig,
} from "./ribbonButtonConfigs";

export function RibbonMenuItem({ item }: { item: RibbonButtonConfig }) {
	return (
		<DropdownMenuItem onClick={item.onClick}>
			<DropdownMenuItemIcon icon={item.icon} />
			<span className="glyphMenuItemLabel">{item.title}</span>
			{item.isActive?.() ? <DropdownMenuItemCheck /> : null}
		</DropdownMenuItem>
	);
}

interface RibbonMenuProps {
	menu: RibbonMenuConfig;
	ctx: RibbonCommandContext;
	canEdit: boolean;
}

export function RibbonMenu({ menu, ctx, canEdit }: RibbonMenuProps) {
	return (
		<DropdownMenu onOpenChange={refocusEditorOnDismiss(ctx)}>
			<DropdownMenuTrigger
				disabled={!canEdit}
				render={
					<button
						type="button"
						className={`ribbonBtn ribbonMenuBtn ${menu.isActive() ? "active" : ""}`}
						title={menu.title}
						aria-label={menu.title}
						onMouseDown={preventMouseDown}
					/>
				}
			>
				<RibbonIcon icon={menu.icon} />
				<HugeiconsIcon
					icon={ArrowDown01Icon}
					size="var(--icon-xs)"
					strokeWidth={2.25}
					className="ribbonMenuChevron"
					aria-hidden="true"
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="top" align="start" finalFocus={false}>
				{menu.items.map((item) => (
					<RibbonMenuItem key={item.title} item={item} />
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
