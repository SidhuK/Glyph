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

function clusterName(graph: ConnectionsGraph, community: number | null): string | null {
	if (community === null) return null;
	const hubId = graph.getAttribute("communities").find((c) => c.index === community)?.hubId;
	return hubId && graph.hasNode(hubId) ? graph.getNodeAttribute(hubId, "label") : null;
}

function connectedNotes(graph: ConnectionsGraph, id: string): ConnectedNote[] {
	return graph
		.neighbors(id)
		.filter((neighbor) => graph.getNodeAttribute(neighbor, "kind") === "note")
		.sort((a, b) => graph.getNodeAttribute(b, "degree") - graph.getNodeAttribute(a, "degree"))
		.map((neighbor) => {
			const label = graph.getNodeAttribute(neighbor, "label");
			const cluster = clusterName(graph, graph.getNodeAttribute(neighbor, "community"));
			// A cluster is named after its hub, so the hub itself would repeat its own title.
			return { id: neighbor, label, cluster: cluster === label ? null : cluster };
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
	const nodeCluster = clusterName(graph, node.community);
	// Hubs name their own cluster, so the kicker would repeat the title.
	const cluster = nodeCluster === node.label ? null : nodeCluster;
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
