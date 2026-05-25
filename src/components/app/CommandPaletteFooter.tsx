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
	const { t } = useTranslation("app");
	const openLabel =
		activeTab === "search"
			? t("commandPalette.footer.openNote")
			: t("commandPalette.footer.runCommand");
	const switchLabel =
		activeTab === "search"
			? t("commandPalette.footer.commands")
			: t("commandPalette.footer.search");

	return (
		<div className="commandPaletteFooter">
			<div className="commandPaletteFooterItem">
				<span className="commandPaletteFooterKeys">
					<kbd>↑</kbd>
					<kbd>↓</kbd>
				</span>
				<span className="commandPaletteFooterLabel">
					{t("commandPalette.footer.navigate")}
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
					{t("commandPalette.footer.close")}
				</span>
			</div>
		</div>
	);
}
