import { useMutation } from "@tanstack/react-query";
import { useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useSpace } from "../../contexts";
import { extractErrorMessage } from "../../lib/errorUtils";
import { showNativePopupMenu, type NativeContextMenuItem } from "../../lib/nativeContextMenu";
import { defaultSpaceIconName } from "../../lib/spaceRegistry";
import { toast } from "../../lib/toast";
import { AppearanceIcon } from "../AppearanceIcon";
import { AppearancePicker } from "../AppearancePicker";
import { ChevronsUpDown } from "../Icons";

/** AppShell handlers that save open editors before the space changes. */
export interface SpaceMenuActions {
	onSelectSpace: (path: string) => Promise<boolean>;
	onOpenSpace: () => Promise<void>;
	onCreateSpace: () => Promise<void>;
	onCloseSpace: () => Promise<void>;
}

/**
 * Sidebar header button naming the active space; opens a native menu of space actions.
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
	const activeSpace = spaces.find((space) => space.path === spacePath);
	if (!activeSpace) return null;
	const busy = spaceAction.isPending || switchingSpacePath !== null;

	const openMenu = (event: MouseEvent<HTMLButtonElement>) => {
		if (busy) return;
		const items: NativeContextMenuItem[] = [
			...spaces.map((space): NativeContextMenuItem => ({
				label: space.name,
				checked: space === activeSpace,
				action: () => {
					if (space !== activeSpace) spaceAction.mutate(() => onSelectSpace(space.path));
				},
			})),
			{ type: "separator" },
			{ label: t("spaceSwitcher.openSpace"), action: () => spaceAction.mutate(onOpenSpace) },
			{ label: t("spaceSwitcher.createSpace"), action: () => spaceAction.mutate(onCreateSpace) },
			{ type: "separator" },
			{ label: t("spaceSwitcher.changeIcon"), action: () => setIconPickerOpen(true) },
			{ label: t("spaceSwitcher.closeSpace"), action: () => spaceAction.mutate(onCloseSpace) },
		];
		void showNativePopupMenu(event, items).catch((error: unknown) => {
			toast.error(t("spaceSwitcher.menuFailed"), { description: extractErrorMessage(error) });
		});
	};

	return (
		<>
			<button
				type="button"
				className="spaceMenuButton"
				aria-disabled={busy}
				aria-haspopup="menu"
				aria-label={t("spaceSwitcher.label", { name: activeSpace.name })}
				title={activeSpace.path}
				onClick={openMenu}
			>
				<AppearanceIcon
					iconName={activeSpace.iconName}
					size="var(--icon-sm)"
					className="spaceMenuButtonIcon"
				/>
				<span className="spaceMenuButtonName">{activeSpace.name}</span>
				<ChevronsUpDown
					size="var(--icon-xs)"
					strokeWidth={2}
					className="spaceMenuButtonChevron"
					aria-hidden="true"
				/>
			</button>

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
		</>
	);
}
