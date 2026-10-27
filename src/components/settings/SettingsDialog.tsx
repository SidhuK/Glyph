import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { useSpace, useUILayoutContext } from "../../contexts";
import { X } from "../Icons";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../ui/shadcn/dialog";
import { SettingsNav } from "./SettingsNav";
import { localizedSettingsTabLabel } from "./settingsSearch";
import { useActiveSettingsTab } from "./useDeveloperMode";

const SettingsTabContent = lazy(() =>
	import("./SettingsTabContent").then((module) => ({
		default: module.SettingsTabContent,
	})),
);

export function SettingsDialog() {
	const { t, i18n } = useTranslation("settings.general");
	const { spacePath } = useSpace();
	const { settingsOpen, closeSettings } = useUILayoutContext();
	const settingsTab = useActiveSettingsTab();

	return (
		<Dialog
			open={settingsOpen}
			onOpenChange={(open) => {
				if (!open) closeSettings();
			}}
		>
			<DialogContent className="settingsDialog" showCloseButton={false}>
				<nav className="settingsDialogNav">
					<SettingsNav />
				</nav>
				<div className="settingsTabPanel">
					<header className="settingsPanelHeader">
						<div className="settingsPanelTitleRow">
							<DialogTitle className="settingsPanelTitle">
								{localizedSettingsTabLabel(settingsTab, i18n.language)}
							</DialogTitle>
						</div>
					</header>
					<Suspense fallback={null}>
						<SettingsTabContent key={spacePath ?? "no-space"} tab={settingsTab} />
					</Suspense>
				</div>
				<DialogClose className="settingsDialogClose" aria-label={t("nav.closeAriaLabel")}>
					<X size="var(--icon-md)" />
				</DialogClose>
			</DialogContent>
		</Dialog>
	);
}
