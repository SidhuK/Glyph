import { Menu } from "@animate-ui/react/primitives/base-ui/menu";
import {
	FolderOpenIcon,
	Logout05Icon,
	PlusSignIcon,
	SmileIcon,
	Tick02Icon,
} from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import type { SpaceDefinition } from "../../lib/spaceRegistry";
import { AppearanceIcon } from "../AppearanceIcon";
import { HugeiconsIcon } from "../HugeiconsIcon";

const ROW_ICON_SIZE = "var(--icon-sm)";

interface SpaceMenuPopupProps {
	spaces: SpaceDefinition[];
	activeSpacePath: string | null;
	onSelectSpace: (path: string) => void;
	onOpenSpace: () => void;
	onCreateSpace: () => void;
	onChangeIcon: () => void;
	onCloseSpace: () => void;
}

/** Animated dropdown listing spaces and space actions, anchored under the sidebar space button. */
export function SpaceMenuPopup({
	spaces,
	activeSpacePath,
	onSelectSpace,
	onOpenSpace,
	onCreateSpace,
	onChangeIcon,
	onCloseSpace,
}: SpaceMenuPopupProps) {
	const { t } = useTranslation("shell");

	return (
		<Menu.Portal>
			<Menu.Positioner className="glyphMenuPositioner" align="start" sideOffset={6}>
				<Menu.Popup className="glyphMenuPopup spaceMenuPopup">
					{spaces.map((space) => {
						const active = space.path === activeSpacePath;
						return (
							<Menu.Item
								key={space.path}
								className="glyphMenuItem"
								onClick={() => {
									if (!active) onSelectSpace(space.path);
								}}
							>
								<AppearanceIcon
									iconName={space.iconName}
									size={ROW_ICON_SIZE}
									className="glyphMenuItemIcon"
								/>
								<span className="glyphMenuItemLabel">{space.name}</span>
								{active ? (
									<HugeiconsIcon
										icon={Tick02Icon}
										size={ROW_ICON_SIZE}
										strokeWidth={2.25}
										className="glyphMenuItemCheck"
									/>
								) : null}
							</Menu.Item>
						);
					})}
					<Menu.Separator className="glyphMenuSeparator" />
					<Menu.Item className="glyphMenuItem" onClick={onOpenSpace}>
						<HugeiconsIcon
							icon={FolderOpenIcon}
							size={ROW_ICON_SIZE}
							className="glyphMenuItemIcon"
						/>
						<span className="glyphMenuItemLabel">{t("spaceSwitcher.openSpace")}</span>
					</Menu.Item>
					<Menu.Item className="glyphMenuItem" onClick={onCreateSpace}>
						<HugeiconsIcon icon={PlusSignIcon} size={ROW_ICON_SIZE} className="glyphMenuItemIcon" />
						<span className="glyphMenuItemLabel">{t("spaceSwitcher.createSpace")}</span>
					</Menu.Item>
					{activeSpacePath ? (
						<>
							<Menu.Separator className="glyphMenuSeparator" />
							<Menu.Item className="glyphMenuItem" onClick={onChangeIcon}>
								<HugeiconsIcon
									icon={SmileIcon}
									size={ROW_ICON_SIZE}
									className="glyphMenuItemIcon"
								/>
								<span className="glyphMenuItemLabel">{t("spaceSwitcher.changeIcon")}</span>
							</Menu.Item>
							<Menu.Item
								className="glyphMenuItem"
								data-variant="destructive"
								onClick={onCloseSpace}
							>
								<HugeiconsIcon
									icon={Logout05Icon}
									size={ROW_ICON_SIZE}
									className="glyphMenuItemIcon"
								/>
								<span className="glyphMenuItemLabel">{t("spaceSwitcher.closeSpace")}</span>
							</Menu.Item>
						</>
					) : null}
				</Menu.Popup>
			</Menu.Positioner>
		</Menu.Portal>
	);
}
