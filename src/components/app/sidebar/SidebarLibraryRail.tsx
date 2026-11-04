import { Popover as PopoverPrimitive } from "@animate-ui/react/primitives/base-ui/popover";
import { AppearanceIcon } from "@/components/AppearanceIcon";
import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import type { FileTreeAppearance } from "@/lib/tauri";
import { basename } from "@/utils/path";
import { Folder01Icon } from "@hugeicons/core-free-icons";
import type { MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
	SIDEBAR_VIEW_TABS,
	type SidebarView,
	type SidebarViewKind,
	isSameSidebarView,
	useSidebarViewTitle,
} from "./SidebarViewStrip";
import type { SidebarLibraryFlyout } from "./useSidebarLibraryFlyout";

/** The flyout opens just past the rail's edge (the stack spans the rail's full width). */
const FLYOUT_SIDE_OFFSET_PX = 6;
const FLYOUT_COLLISION_PADDING_PX = 8;

interface SidebarLibraryRailProps {
	view: SidebarView;
	folderTabs: string[];
	folderIcons: Record<string, FileTreeAppearance | undefined>;
	flyout: SidebarLibraryFlyout;
	onSelectView: (view: SidebarViewKind) => void;
	onSelectFolder: (folderPath: string) => void;
	onFolderContextMenu: (event: MouseEvent<HTMLButtonElement>, folderPath: string) => void;
}

interface RailItem {
	id: string;
	label: string;
	icon: ReactNode;
	view: SidebarView;
	select: () => void;
	onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
}

/** The library in the rail: one icon per view (Files, Pinned, Tags, Recents, quick folders)
 * on the icon column. Each opens the flyout that holds the library body. */
export function SidebarLibraryRail({
	view,
	folderTabs,
	folderIcons,
	flyout,
	onSelectView,
	onSelectFolder,
	onFolderContextMenu,
}: SidebarLibraryRailProps) {
	const { t } = useTranslation("shell");
	const title = useSidebarViewTitle(view);
	const items: RailItem[] = [
		...SIDEBAR_VIEW_TABS.map((tab) => ({
			id: tab.kind,
			label: t(tab.labelKey),
			icon: (
				<HugeiconsIcon
					icon={tab.icon}
					size="var(--sidebar-icon-size, var(--icon-lg))"
					aria-hidden="true"
				/>
			),
			view: { kind: tab.kind },
			select: () => onSelectView(tab.kind),
		})),
		...folderTabs.map((folderPath) => {
			const iconName = folderIcons[folderPath]?.icon;
			return {
				id: `folder:${folderPath}`,
				label: basename(folderPath),
				icon: iconName ? (
					<AppearanceIcon iconName={iconName} size="var(--sidebar-icon-size, var(--icon-lg))" />
				) : (
					<HugeiconsIcon
						icon={Folder01Icon}
						size="var(--sidebar-icon-size, var(--icon-lg))"
						aria-hidden="true"
					/>
				),
				view: { kind: "folder", path: folderPath },
				select: () => onSelectFolder(folderPath),
				onContextMenu: (event: MouseEvent<HTMLButtonElement>) =>
					onFolderContextMenu(event, folderPath),
			} satisfies RailItem;
		}),
	];

	return (
		<>
			<div
				ref={flyout.railStackRef}
				className="sidebarLibraryRail"
				role="group"
				aria-label={t("sidebar.library")}
			>
				{items.map((item) => {
					const active = isSameSidebarView(item.view, view);
					return (
						<button
							key={item.id}
							type="button"
							className="sidebarQuickActionBtn sidebarNavBtn sidebarLibraryRailBtn"
							data-active={active ? "true" : undefined}
							aria-label={item.label}
							title={item.label}
							aria-haspopup="dialog"
							aria-expanded={flyout.open && active}
							onClick={() => flyout.toggle(active, item.select)}
							onContextMenu={item.onContextMenu}
						>
							{item.icon}
						</button>
					);
				})}
			</div>
			<PopoverPrimitive.Root open={flyout.open} onOpenChange={flyout.handleOpenChange}>
				<PopoverPrimitive.Portal>
					<PopoverPrimitive.Positioner
						anchor={flyout.railStackRef}
						side="right"
						align="start"
						sideOffset={FLYOUT_SIDE_OFFSET_PX}
						collisionPadding={FLYOUT_COLLISION_PADDING_PX}
						className="sidebarRailFlyoutPositioner"
					>
						<PopoverPrimitive.Popup className="sidebarRailFlyout" aria-label={title}>
							<div ref={flyout.attachFlyoutBody} className="sidebarRailFlyoutBody" />
						</PopoverPrimitive.Popup>
					</PopoverPrimitive.Positioner>
				</PopoverPrimitive.Portal>
			</PopoverPrimitive.Root>
		</>
	);
}
