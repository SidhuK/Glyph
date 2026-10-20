import { FolderOpenIcon, Logout05Icon, PlusSignIcon, SmileIcon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import type { SpaceDefinition } from "../../lib/spaceRegistry";
import { AppearanceIcon } from "../AppearanceIcon";
import {
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuItemCheck,
	DropdownMenuItemIcon,
	DropdownMenuSeparator,
} from "../ui/shadcn/dropdown-menu";

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
		<DropdownMenuContent className="spaceMenuPopup" align="start" sideOffset={6}>
			{spaces.map((space) => {
				const active = space.path === activeSpacePath;
				return (
					<DropdownMenuItem
						key={space.path}
						onClick={() => {
							if (!active) onSelectSpace(space.path);
						}}
					>
						<AppearanceIcon
							iconName={space.iconName}
							size="var(--icon-sm)"
							className="glyphMenuItemIcon"
						/>
						<span className="glyphMenuItemLabel">{space.name}</span>
						{active ? <DropdownMenuItemCheck /> : null}
					</DropdownMenuItem>
				);
			})}
			<DropdownMenuSeparator />
			<DropdownMenuItem onClick={onOpenSpace}>
				<DropdownMenuItemIcon icon={FolderOpenIcon} />
				<span className="glyphMenuItemLabel">{t("spaceSwitcher.openSpace")}</span>
			</DropdownMenuItem>
			<DropdownMenuItem onClick={onCreateSpace}>
				<DropdownMenuItemIcon icon={PlusSignIcon} />
				<span className="glyphMenuItemLabel">{t("spaceSwitcher.createSpace")}</span>
			</DropdownMenuItem>
			{activeSpacePath ? (
				<>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={onChangeIcon}>
						<DropdownMenuItemIcon icon={SmileIcon} />
						<span className="glyphMenuItemLabel">{t("spaceSwitcher.changeIcon")}</span>
					</DropdownMenuItem>
					<DropdownMenuItem variant="destructive" onClick={onCloseSpace}>
						<DropdownMenuItemIcon icon={Logout05Icon} />
						<span className="glyphMenuItemLabel">{t("spaceSwitcher.closeSpace")}</span>
					</DropdownMenuItem>
				</>
			) : null}
		</DropdownMenuContent>
	);
}
