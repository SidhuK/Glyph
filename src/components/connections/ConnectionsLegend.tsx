import { useTranslation } from "react-i18next";
import { useConnectionsView } from "./ConnectionsViewContext";

type LegendTone = "accent" | "linked" | "unlinked";

interface LegendItem {
	readonly tone: LegendTone;
	readonly label: string;
}

export function ConnectionsLegend() {
	const { t } = useTranslation("shell");
	const { selectedId, pathMode, hasUnlinked } = useConnectionsView();

	const items: LegendItem[] = pathMode
		? [{ tone: "accent", label: t("connections.legend.onPath") }]
		: [
				...(selectedId
					? [{ tone: "accent", label: t("connections.legend.selected") } as const]
					: []),
				{ tone: "linked", label: t("connections.legend.linked") },
				...(hasUnlinked
					? [{ tone: "unlinked", label: t("connections.legend.noLinks") } as const]
					: []),
			];
	const hint = pathMode
		? t("connections.legend.escToExit")
		: selectedId
			? null
			: t("connections.legend.clickHint");

	return (
		<div className="connectionsLegend" role="note" aria-label={t("connections.legend.aria")}>
			{items.map((item) => (
				<span key={item.tone} className="connectionsLegendItem">
					<span className="connectionsLegendDot" data-tone={item.tone} aria-hidden="true" />
					{item.label}
				</span>
			))}
			{hint ? <span className="connectionsLegendHint">{hint}</span> : null}
		</div>
	);
}
