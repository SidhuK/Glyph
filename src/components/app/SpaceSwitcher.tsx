import { useCallback, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../lib/errorUtils";
import { showNativeContextMenu } from "../../lib/nativeContextMenu";
import { defaultSpaceIconName, type SpaceDefinition } from "../../lib/spaceRegistry";
import { toast } from "../../lib/toast";
import { AppearancePicker } from "../AppearancePicker";
import { DatabaseColumnIcon } from "../database/DatabaseColumnIcon";

interface SpaceSwitcherProps {
	spaces: SpaceDefinition[];
	activeSpacePath: string | null;
	switchingSpacePath: string | null;
	onSelectSpace: (path: string) => Promise<boolean>;
	onSetSpaceIcon: (path: string, iconName: string | null) => Promise<void>;
	onCloseSpace: (path: string) => Promise<void>;
}

export function SpaceSwitcher(props: SpaceSwitcherProps) {
	if (props.spaces.length <= 1) return null;
	return <SpaceSwitcherContent {...props} />;
}

function SpaceSwitcherContent({
	spaces,
	activeSpacePath,
	switchingSpacePath,
	onSelectSpace,
	onSetSpaceIcon,
	onCloseSpace,
}: SpaceSwitcherProps) {
	const { t } = useTranslation("shell");
	const [iconPickerSpacePath, setIconPickerSpacePath] = useState<string | null>(null);
	const [pendingAction, setPendingAction] = useState<
		{ kind: "switch"; path: string } | { kind: "close" } | null
	>(null);
	const iconPickerSpace = spaces.find((space) => space.path === iconPickerSpacePath) ?? null;
	const busy = pendingAction !== null || switchingSpacePath !== null;
	const pendingSpacePath =
		pendingAction?.kind === "switch" ? pendingAction.path : switchingSpacePath;

	const switchSpace = useCallback(
		async (path: string) => {
			if (busy || path === activeSpacePath) return;
			setPendingAction({ kind: "switch", path });
			try {
				await onSelectSpace(path);
			} finally {
				setPendingAction(null);
			}
		},
		[activeSpacePath, busy, onSelectSpace],
	);
	const closeSpace = useCallback(
		async (path: string) => {
			if (busy) return;
			setPendingAction({ kind: "close" });
			try {
				await onCloseSpace(path);
			} finally {
				setPendingAction(null);
			}
		},
		[busy, onCloseSpace],
	);
	const openSpaceMenu = useCallback(
		(event: MouseEvent<HTMLButtonElement>, space: SpaceDefinition) => {
			void showNativeContextMenu(event, [
				{
					label: t("spaceSwitcher.changeIcon"),
					action: () => setIconPickerSpacePath(space.path),
				},
				{ type: "separator" },
				{
					label: t("spaceSwitcher.closeSpace"),
					action: () => void closeSpace(space.path),
				},
			]).catch((error: unknown) => {
				toast.error(t("spaceSwitcher.menuFailed"), {
					description: extractErrorMessage(error),
				});
			});
		},
		[closeSpace, t],
	);

	return (
		<>
			<nav className="spaceSwitcher" aria-label={t("spaceSwitcher.label")} aria-busy={busy}>
				<div className="spaceSwitcherList">
					{spaces.map((space) => {
						const active = space.path === activeSpacePath;
						const switching = space.path === pendingSpacePath;
						return (
							<button
								key={space.path}
								type="button"
								className="spaceSwitcherButton"
								data-active={active ? "true" : undefined}
								data-switching={switching ? "true" : undefined}
								aria-disabled={busy}
								aria-current={active ? "page" : undefined}
								aria-label={t("spaceSwitcher.switchTo", { name: space.name })}
								title={space.name}
								disabled={busy}
								onClick={() => void switchSpace(space.path)}
								onContextMenu={(event) => openSpaceMenu(event, space)}
							>
								<DatabaseColumnIcon
									iconName={space.iconName}
									size="var(--icon-md)"
									strokeWidth={active ? 2.5 : 1.5}
								/>
							</button>
						);
					})}
				</div>
			</nav>

			<AppearancePicker
				title={t("spaceSwitcher.chooseIcon")}
				open={iconPickerSpace !== null}
				onOpenChange={(open) => {
					if (!open) setIconPickerSpacePath(null);
				}}
				iconValue={iconPickerSpace?.iconOverride ?? null}
				defaultIconName={iconPickerSpace ? defaultSpaceIconName(iconPickerSpace.path) : "folder"}
				showDefaultIcon
				onIconChange={(iconName) => {
					if (!iconPickerSpace) return;
					void onSetSpaceIcon(iconPickerSpace.path, iconName);
				}}
			/>
		</>
	);
}
