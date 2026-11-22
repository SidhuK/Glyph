import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Button } from "@/components/ui/shadcn/button";
import { Route01Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import { ConnectionsPeekBody } from "./ConnectionsPeek";
import { useConnectionsView } from "./ConnectionsViewContext";

export function ConnectionsInspector() {
	const { t } = useTranslation("shell");
	const { graph, selectedId, startPath, openNode } = useConnectionsView();
	if (!graph || !selectedId || !graph.hasNode(selectedId)) return null;
	const isNote = graph.getNodeAttribute(selectedId, "kind") === "note";

	return (
		<section
			className="connectionsFloat connectionsPeek connectionsInspector"
			aria-label={t("connections.inspector.aria")}
		>
			<ConnectionsPeekBody id={selectedId} />
			<div className="connectionsInspectorActions">
				<Button size="xs" className="connectionsInspectorOpen" onClick={() => openNode(selectedId)}>
					{isNote ? t("connections.inspector.openNote") : t("connections.inspector.showNotes")}
				</Button>
				<Button
					variant="outline"
					size="xs"
					className="connectionsInspectorPathStart"
					onClick={() => startPath(selectedId)}
				>
					<HugeiconsIcon icon={Route01Icon} />
					{t("connections.inspector.pathFromHere")}
				</Button>
			</div>
		</section>
	);
}
