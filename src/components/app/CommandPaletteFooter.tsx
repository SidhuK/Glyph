import { useTranslation } from "react-i18next";
import type { Tab } from "./commandPaletteHelpers";

interface CommandPaletteFooterProps {
	activeTab: Tab;
	canSearch: boolean;
}

export function CommandPaletteFooter({
	activeTab,
	canSearch,
}: CommandPaletteFooterProps) {
	const { t } = useTranslation("shell");
	const openLabel =
		activeTab === "search"
			? t("commandPalette.openNote")
			: t("commandPalette.runCommand");
	const switchLabel =
		activeTab === "search"
			? t("commandPalette.commands")
			: t("commandPalette.search");

	return (
		<div className="commandPaletteFooter">
			<div className="commandPaletteFooterItem">
				<span className="commandPaletteFooterKeys">
					<kbd>↑</kbd>
					<kbd>↓</kbd>
				</span>
				<span className="commandPaletteFooterLabel">
					{t("commandPalette.navigate")}
				</span>
			</div>
			<div className="commandPaletteFooterItem">
				<span className="commandPaletteFooterKeys">
					<kbd>Return</kbd>
				</span>
				<span className="commandPaletteFooterLabel">{openLabel}</span>
			</div>
			{canSearch || activeTab === "search" ? (
				<div className="commandPaletteFooterItem">
					<span className="commandPaletteFooterKeys">
						<kbd>Tab</kbd>
					</span>
					<span className="commandPaletteFooterLabel">{switchLabel}</span>
				</div>
			) : null}
			<div className="commandPaletteFooterItem">
				<span className="commandPaletteFooterKeys">
					<kbd>Esc</kbd>
				</span>
				<span className="commandPaletteFooterLabel">
					{t("commandPalette.close")}
				</span>
			</div>
		</div>
	);
}
