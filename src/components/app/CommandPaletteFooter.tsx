import type { Tab } from "./commandPaletteHelpers";

interface CommandPaletteFooterProps {
	activeTab: Tab;
	canSearch: boolean;
}

export function CommandPaletteFooter({
	activeTab,
	canSearch,
}: CommandPaletteFooterProps) {
	const openLabel = activeTab === "search" ? "Open note" : "Run command";
	const switchLabel = activeTab === "search" ? "Commands" : "Search";

	return (
		<div className="commandPaletteFooter">
			<div className="commandPaletteFooterItem">
				<span className="commandPaletteFooterKeys">
					<kbd>↑</kbd>
					<kbd>↓</kbd>
				</span>
				<span className="commandPaletteFooterLabel">Navigate</span>
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
				<span className="commandPaletteFooterLabel">Close</span>
			</div>
		</div>
	);
}
