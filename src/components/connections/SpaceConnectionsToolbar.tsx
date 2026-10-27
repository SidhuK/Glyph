import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Route01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import { onWindowDragMouseDown } from "../../utils/window";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";
import { ConnectionsDisplayPopover } from "./ConnectionsDisplayPopover";
import { useConnectionsView } from "./ConnectionsViewContext";

export function SpaceConnectionsToolbar() {
	const { t } = useTranslation("shell");
	const { pathMode, setPathMode, searchQuery, setSearchQuery, searchInputRef } =
		useConnectionsView();

	// The band sits on the traffic-light row (the tab bar above lets clicks through here),
	// so its empty space keeps dragging the window while the controls stay clickable.
	return (
		<div
			className="spaceConnectionsTitleBar"
			data-tauri-drag-region=""
			onMouseDown={onWindowDragMouseDown}
		>
			<div className="spaceConnectionsToolbar">
				<div className="spaceConnectionsSearch">
					<HugeiconsIcon
						icon={Search01Icon}
						size="var(--icon-sm)"
						className="spaceConnectionsSearchIcon"
					/>
					<Input
						ref={searchInputRef}
						value={searchQuery}
						onChange={(event) => setSearchQuery(event.target.value)}
						placeholder={t("connections.searchPlaceholder")}
						aria-label={t("connections.searchAria")}
						className="spaceConnectionsSearchInput"
					/>
					{searchQuery ? null : (
						<kbd className="spaceConnectionsSearchHint" aria-hidden="true">
							⌘F
						</kbd>
					)}
				</div>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					static
					aria-label={t("connections.pathAria")}
					aria-pressed={pathMode}
					onClick={() => setPathMode(!pathMode)}
				>
					<HugeiconsIcon icon={Route01Icon} size="var(--icon-sm)" />
					{t("connections.path")}
				</Button>
				<ConnectionsDisplayPopover />
			</div>
		</div>
	);
}
