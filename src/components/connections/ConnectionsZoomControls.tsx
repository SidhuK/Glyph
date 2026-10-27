import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { CenterFocusIcon, MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/shadcn/button";
import { useConnectionsView } from "./ConnectionsViewContext";

export function ConnectionsZoomControls() {
	const { t } = useTranslation("shell");
	const { overlay, zoomPercent } = useConnectionsView();

	return (
		<div className="connectionsZoomControls" role="group" aria-label={t("connections.zoomLevel")}>
			<Button
				type="button"
				size="icon-xs"
				variant="ghost"
				static
				aria-label={t("connections.zoomOut")}
				onClick={() => overlay.current.zoomOut()}
			>
				<HugeiconsIcon icon={MinusSignIcon} size="var(--icon-sm)" />
			</Button>
			<output className="connectionsZoomPercent">{Math.round(zoomPercent)}%</output>
			<Button
				type="button"
				size="icon-xs"
				variant="ghost"
				static
				aria-label={t("connections.zoomIn")}
				onClick={() => overlay.current.zoomIn()}
			>
				<HugeiconsIcon icon={PlusSignIcon} size="var(--icon-sm)" />
			</Button>
			<Button
				type="button"
				size="icon-xs"
				variant="ghost"
				static
				aria-label={t("connections.zoomFit")}
				onClick={() => overlay.current.fitView()}
			>
				<HugeiconsIcon icon={CenterFocusIcon} size="var(--icon-sm)" />
			</Button>
		</div>
	);
}
