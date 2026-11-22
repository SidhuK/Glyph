import { type KeyboardEvent, type RefObject, Suspense, lazy, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSpace, useUILayoutContext } from "../../contexts";
import { X } from "../Icons";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../ui/shadcn/dialog";
import { SettingsNav } from "./SettingsNav";
import { SettingsSearchProvider, useSettingsSearch } from "./search/SettingsSearchContext";
import { localizedSettingsTabLabel } from "./settingsSearch";
import { useActiveSettingsTab } from "./useDeveloperMode";

const SettingsTabContent = lazy(() =>
	import("./SettingsTabContent").then((module) => ({
		default: module.SettingsTabContent,
	})),
);

function isFindShortcut(event: KeyboardEvent) {
	return event.metaKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "f";
}

function SettingsPanel({ panelRef }: { panelRef: RefObject<HTMLDivElement | null> }) {
	const { t, i18n } = useTranslation("settings.general");
	const { spacePath } = useSpace();
	const settingsTab = useActiveSettingsTab();
	const { paneFilter } = useSettingsSearch();

	return (
		<div
			ref={panelRef}
			className="settingsTabPanel"
			tabIndex={-1}
			data-settings-searching={paneFilter ? "" : undefined}
		>
			<header className="settingsPanelHeader">
				<div className="settingsPanelTitleRow">
					<DialogTitle className="settingsPanelTitle">
						{localizedSettingsTabLabel(settingsTab, i18n.language)}
					</DialogTitle>
					{paneFilter ? (
						<span className="settingsPanelSearchSummary" aria-live="polite">
							{t("nav.searchResults", {
								count: paneFilter.matches.length,
								query: paneFilter.filter.query,
							})}
						</span>
					) : null}
				</div>
			</header>
			<Suspense fallback={null}>
				<SettingsTabContent key={spacePath ?? "no-space"} tab={settingsTab} />
			</Suspense>
		</div>
	);
}

export function SettingsDialog() {
	const { t } = useTranslation("settings.general");
	const { settingsOpen, closeSettings } = useUILayoutContext();
	const panelRef = useRef<HTMLDivElement | null>(null);
	const searchInputRef = useRef<HTMLInputElement | null>(null);

	return (
		<Dialog
			open={settingsOpen}
			onOpenChange={(open) => {
				if (!open) closeSettings();
			}}
		>
			<DialogContent
				className="settingsDialog"
				showCloseButton={false}
				initialFocus={panelRef}
				onKeyDown={(event) => {
					if (!isFindShortcut(event)) return;
					event.preventDefault();
					event.stopPropagation();
					searchInputRef.current?.focus();
					searchInputRef.current?.select();
				}}
			>
				<SettingsSearchProvider inputRef={searchInputRef}>
					<nav className="settingsDialogNav">
						<SettingsNav />
					</nav>
					<SettingsPanel panelRef={panelRef} />
				</SettingsSearchProvider>
				<DialogClose className="settingsDialogClose" aria-label={t("nav.closeAriaLabel")}>
					<X size="var(--icon-md)" />
				</DialogClose>
			</DialogContent>
		</Dialog>
	);
}
