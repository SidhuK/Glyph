import { Menu } from "@animate-ui/react/primitives/base-ui/menu";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSpace } from "../../contexts";
import { extractErrorMessage } from "../../lib/errorUtils";
import { defaultSpaceIconName } from "../../lib/spaceRegistry";
import { toast } from "../../lib/toast";
import { AppearanceIcon } from "../AppearanceIcon";
import { AppearancePicker } from "../AppearancePicker";
import { ChevronsUpDown } from "../Icons";
import { SpaceMenuPopup } from "./SpaceMenuPopup";

/** AppShell handlers that save open editors before the space changes. */
export interface SpaceMenuActions {
	onSelectSpace: (path: string) => Promise<boolean>;
	onOpenSpace: () => Promise<void>;
	onCreateSpace: () => Promise<void>;
	onCloseSpace: () => Promise<void>;
}

/**
 * Sidebar header button naming the active space; opens an animated menu of space actions.
 * Key it by space path so the icon picker never outlives the space it was opened for.
 */
export function SpaceMenuButton({
	onSelectSpace,
	onOpenSpace,
	onCreateSpace,
	onCloseSpace,
}: SpaceMenuActions) {
	const { t } = useTranslation("shell");
	const { spaces, spacePath, switchingSpacePath, setSpaceIcon } = useSpace();
	const [iconPickerOpen, setIconPickerOpen] = useState(false);
	const spaceAction = useMutation({
		mutationFn: (action: () => Promise<unknown>) => action(),
		onError: (error) => {
			toast.error(t("spaceSwitcher.actionFailed"), { description: extractErrorMessage(error) });
		},
	});
	const activeSpace = spaces.find((space) => space.path === spacePath) ?? null;
	if (!activeSpace && spaces.length === 0) return null;
	const buttonLabel = activeSpace?.name ?? t("workspace.openSpace");
	const busy = spaceAction.isPending || switchingSpacePath !== null;

	return (
		<>
			<Menu.Root
				onOpenChange={(open, details) => {
					if (open && busy) details.cancel();
				}}
			>
				<Menu.Trigger
					className="spaceMenuButton"
					aria-disabled={busy}
					aria-haspopup="menu"
					aria-label={
						activeSpace ? t("spaceSwitcher.label", { name: activeSpace.name }) : buttonLabel
					}
					title={activeSpace?.path}
				>
					<AppearanceIcon
						iconName={activeSpace?.iconName ?? "folder"}
						size="var(--icon-sm)"
						className="spaceMenuButtonIcon"
					/>
					<span className="spaceMenuButtonName">{buttonLabel}</span>
					<ChevronsUpDown
						size="var(--icon-xs)"
						strokeWidth={2}
						className="spaceMenuButtonChevron"
						aria-hidden="true"
					/>
				</Menu.Trigger>
				<SpaceMenuPopup
					spaces={spaces}
					activeSpacePath={activeSpace?.path ?? null}
					onSelectSpace={(path) => spaceAction.mutate(() => onSelectSpace(path))}
					onOpenSpace={() => spaceAction.mutate(onOpenSpace)}
					onCreateSpace={() => spaceAction.mutate(onCreateSpace)}
					onChangeIcon={() => setIconPickerOpen(true)}
					onCloseSpace={() => spaceAction.mutate(onCloseSpace)}
				/>
			</Menu.Root>

			{activeSpace ? (
				<AppearancePicker
					title={t("spaceSwitcher.chooseIcon")}
					open={iconPickerOpen}
					onOpenChange={setIconPickerOpen}
					iconValue={activeSpace.iconOverride}
					defaultIconName={defaultSpaceIconName(activeSpace.path)}
					showDefaultIcon
					allowEmoji
					onIconChange={(iconName) => void setSpaceIcon(activeSpace.path, iconName)}
				/>
			) : null}
		</>
	);
}
