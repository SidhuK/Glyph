import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Button } from "@/components/ui/shadcn/button";
import { Close, Route01Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import type { ConnectionsGraph } from "./connectionsGraph";
import { useConnectionsView } from "./ConnectionsViewContext";

const MAX_CONNECTED_NOTES = 6;

interface ConnectedNote {
	readonly id: string;
	readonly label: string;
	readonly cluster: string | null;
}

/** The node's cluster name, or null for hubs, which name their own cluster. */
function clusterName(graph: ConnectionsGraph, id: string): string | null {
	const community = graph.getNodeAttribute(id, "community");
	if (community === null) return null;
	const hubId = graph.getAttribute("communities").find((c) => c.index === community)?.hubId;
	if (!hubId || hubId === id || !graph.hasNode(hubId)) return null;
	return graph.getNodeAttribute(hubId, "label");
}

function connectedNotes(graph: ConnectionsGraph, id: string): ConnectedNote[] {
	return graph
		.neighbors(id)
		.filter((neighbor) => graph.getNodeAttribute(neighbor, "kind") === "note")
		.sort((a, b) => graph.getNodeAttribute(b, "degree") - graph.getNodeAttribute(a, "degree"))
		.map((neighbor) => {
			const label = graph.getNodeAttribute(neighbor, "label");
			return { id: neighbor, label, cluster: clusterName(graph, neighbor) };
		});
}

function countByKind(graph: ConnectionsGraph, ids: readonly string[], kind: "note" | "tag") {
	return ids.filter((id) => graph.getNodeAttribute(id, "kind") === kind).length;
}

export function ConnectionsInspector() {
	const { t } = useTranslation("shell");
	const { graph, selectedId, selectNode, pathMode, pathFromId, setPathEnd, startPath, openNode } =
		useConnectionsView();
	if (!graph || !selectedId || !graph.hasNode(selectedId)) return null;

	const node = graph.getNodeAttributes(selectedId);
	const isTag = node.kind === "tag";
	const cluster = clusterName(graph, selectedId);
	const kicker = isTag ? t("connections.inspector.tag") : cluster;
	const neighbors = connectedNotes(graph, selectedId);
	const shown = neighbors.slice(0, MAX_CONNECTED_NOTES);
	const stats = [
		{
			key: "backlinks",
			value: countByKind(graph, graph.inNeighbors(selectedId), "note"),
		},
		{
			key: "linksOut",
			value: countByKind(graph, graph.outNeighbors(selectedId), "note"),
		},
		{ key: "tags", value: countByKind(graph, graph.neighbors(selectedId), "tag") },
	] as const;

	const handleNeighborClick = (id: string) => {
		selectNode(id);
		if (pathMode) setPathEnd(id, pathFromId ? "to" : "from");
	};

	return (
		<section
			className="connectionsFloat connectionsInspector"
			aria-label={t("connections.inspector.aria")}
		>
			<div className="connectionsInspectorKicker">
				{kicker ? (
					<>
						<span className="connectionsInspectorDot" aria-hidden="true" />
						<span className="connectionsInspectorKickerText">{kicker}</span>
					</>
				) : null}
				<Button
					variant="ghost"
					size="icon-xs"
					className="connectionsInspectorClose"
					aria-label={t("connections.inspector.close")}
					onClick={() => selectNode(null)}
				>
					<HugeiconsIcon icon={Close} />
				</Button>
			</div>
			<div>
				<h2 className="connectionsInspectorTitle">{isTag ? `#${node.label}` : node.label}</h2>
				{isTag ? null : (
					<div className="connectionsInspectorPath" title={selectedId}>
						<span dir="ltr">{selectedId}</span>
					</div>
				)}
			</div>
			<dl className="connectionsInspectorStats">
				{stats.map((stat) => (
					<div key={stat.key}>
						<dd>{stat.value}</dd>
						<dt>{t(`connections.inspector.${stat.key}`)}</dt>
					</div>
				))}
			</dl>
			{shown.length > 0 ? (
				<div>
					<div className="connectionsInspectorGroup">{t("connections.inspector.connected")}</div>
					<ul className="connectionsInspectorList">
						{shown.map((neighbor) => (
							<li key={neighbor.id}>
								<button type="button" onClick={() => handleNeighborClick(neighbor.id)}>
									<span className="connectionsInspectorListLabel">{neighbor.label}</span>
									{neighbor.cluster ? <em>{neighbor.cluster}</em> : null}
								</button>
							</li>
						))}
					</ul>
					{neighbors.length > shown.length ? (
						<div className="connectionsInspectorMore">
							{t("connections.more", { count: neighbors.length - shown.length })}
						</div>
					) : null}
				</div>
			) : null}
			<div className="connectionsInspectorActions">
				<Button size="xs" onClick={() => openNode(selectedId)}>
					{t("connections.inspector.openNote")}
				</Button>
				<Button variant="outline" size="xs" onClick={() => startPath(selectedId)}>
					<HugeiconsIcon icon={Route01Icon} />
					{t("connections.inspector.pathFromHere")}
				</Button>
			</div>
		</section>
	);
}
