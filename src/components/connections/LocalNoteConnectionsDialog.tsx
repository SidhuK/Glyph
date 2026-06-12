import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalNoteConnections } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { dispatchWikiLinkClick } from "../editor/markdown/editorEvents";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogTitle,
} from "../ui/shadcn/dialog";
import {
	applyLocalNoteConnectionsTheme,
	highlightNeighborhood,
	localNoteConnectionsLayoutSpacing,
	localNoteConnectionsStylesForContainer,
	registerFcose,
	runLocalNoteConnectionsLayout,
} from "./connectionsTheme";

interface LocalNoteConnectionsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	noteId: string;
	connectionsRefreshKey?: number;
}

function nodeClasses(
	node: LocalNoteConnections["nodes"][number],
	weight: number,
) {
	const classes = [];
	if (node.is_center) {
		classes.push("center");
	} else if (weight >= 5) {
		classes.push("hub-strong");
	} else if (weight >= 3) {
		classes.push("hub");
	} else if (weight >= 2) {
		classes.push("connected");
	}
	return classes.join(" ");
}

function connectionElements(graph: LocalNoteConnections): ElementDefinition[] {
	const degreeById = new Map(graph.nodes.map((node) => [node.id, 0]));
	const edgeKeys = new Set(
		graph.edges.map((edge) => `${edge.source}->${edge.target}`),
	);
	for (const edge of graph.edges) {
		degreeById.set(edge.source, (degreeById.get(edge.source) ?? 0) + 1);
		degreeById.set(edge.target, (degreeById.get(edge.target) ?? 0) + 1);
	}
	for (const edge of graph.tag_edges) {
		degreeById.set(edge.note_id, (degreeById.get(edge.note_id) ?? 0) + 1);
	}

	return [
		...graph.nodes.map((node) => ({
			data: {
				id: node.id,
				label: node.title || node.id,
				weight: degreeById.get(node.id) ?? 0,
			},
			classes: nodeClasses(node, degreeById.get(node.id) ?? 0),
			grabbable: !node.is_center,
		})),
		...graph.tags.map((tag) => ({
			data: {
				id: tag.id,
				label: tag.title,
				noteCount: tag.note_count,
				tag: tag.tag,
			},
			classes: tag.note_count >= 4 ? "tag tag-strong" : "tag",
			grabbable: true,
		})),
		...graph.edges.map((edge, index) => {
			const classes = ["link"];
			if (edge.source === graph.center.id) {
				classes.push("from-center");
			} else if (edge.target === graph.center.id) {
				classes.push("to-center");
			} else {
				classes.push("internal");
			}
			if (edgeKeys.has(`${edge.target}->${edge.source}`)) {
				classes.push("reciprocal");
			}

			return {
				data: {
					id: `${edge.source}->${edge.target}:${index}`,
					source: edge.source,
					target: edge.target,
				},
				classes: classes.join(" "),
			};
		}),
		...graph.tag_edges.map((edge, index) => ({
			data: {
				id: `${edge.tag_id}->${edge.note_id}:tag:${index}`,
				source: edge.tag_id,
				target: edge.note_id,
			},
			classes: "tag-link",
		})),
	];
}

export function LocalNoteConnectionsDialog({
	open,
	onOpenChange,
	noteId,
	connectionsRefreshKey = 0,
}: LocalNoteConnectionsDialogProps) {
	const [graph, setGraph] = useState<LocalNoteConnections | null>(null);
	const [error, setError] = useState("");
	const containerRef = useRef<HTMLDivElement | null>(null);
	const cyRef = useRef<Core | null>(null);

	const openNode = useCallback(
		(nodeId: string) => {
			dispatchWikiLinkClick({
				raw: `[[${nodeId}]]`,
				target: nodeId,
				alias: null,
				anchorKind: "none",
				anchor: null,
				unresolved: false,
			});
			onOpenChange(false);
		},
		[onOpenChange],
	);

	useEffect(() => {
		if (!open || !noteId) return;
		void connectionsRefreshKey;
		let cancelled = false;
		setGraph(null);
		setError("");

		void invoke("note_local_connections", { note_id: noteId })
			.then((nextGraph) => {
				if (cancelled) return;
				setGraph(nextGraph);
			})
			.catch((cause) => {
				if (cancelled) return;
				setGraph(null);
				setError(cause instanceof Error ? cause.message : String(cause));
			});

		return () => {
			cancelled = true;
		};
	}, [connectionsRefreshKey, noteId, open]);

	useEffect(() => {
		if (!open || !graph || error) return;
		const container = containerRef.current;
		if (!container) return;

		registerFcose();

		const cy = cytoscape({
			boxSelectionEnabled: false,
			container,
			elements: connectionElements(graph),
			maxZoom: 2.2,
			minZoom: 0.35,
			style: localNoteConnectionsStylesForContainer(container),
			userZoomingEnabled: true,
			wheelSensitivity: 0.18,
		});
		cyRef.current = cy;
		runLocalNoteConnectionsLayout(cy);

		cy.on("mouseover", "node", (event) => {
			highlightNeighborhood(cy, event.target.id());
		});
		cy.on("mouseout", "node", () => {
			highlightNeighborhood(cy, null);
		});
		cy.on("tap", "node", (event) => {
			if (event.target.hasClass("tag")) {
				highlightNeighborhood(cy, event.target.id());
				return;
			}
			openNode(event.target.id());
		});
		cy.on("tap", (event) => {
			if (event.target === cy) {
				highlightNeighborhood(cy, null);
			}
		});

		const observer = new ResizeObserver(() => {
			cy.resize();
			cy.fit(undefined, localNoteConnectionsLayoutSpacing(cy).padding);
		});
		observer.observe(container);

		const themeObserver = new MutationObserver(() => {
			applyLocalNoteConnectionsTheme(cy, container);
		});
		themeObserver.observe(document.documentElement, {
			attributeFilter: [
				"class",
				"data-light-theme",
				"data-dark-theme",
				"style",
			],
			attributes: true,
		});

		return () => {
			themeObserver.disconnect();
			observer.disconnect();
			cy.destroy();
			cyRef.current = null;
		};
	}, [error, graph, open, openNode]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="localNoteConnectionsDialog"
				showCloseButton={false}
			>
				<DialogTitle className="sr-only">Connected Notes</DialogTitle>

				<div className="localNoteConnectionsBody">
					<DialogClose asChild>
						<button
							type="button"
							className="localNoteConnectionsClose"
							aria-label="Close connections"
						>
							×
						</button>
					</DialogClose>
					{error ? (
						<div className="localNoteConnectionsState">
							Could not load connections: {error}
						</div>
					) : (
						<div className="localNoteConnectionsStage">
							<div
								ref={containerRef}
								className="localNoteConnectionsViewport"
								aria-label="Local connections"
							/>
							<div
								className="localNoteConnectionsLegend"
								aria-label="Connections legend"
							>
								<span className="localNoteConnectionsLegendItem">
									<span
										className="localNoteConnectionsLegendNode is-current"
										aria-hidden="true"
									/>
									Open note
								</span>
								<span className="localNoteConnectionsLegendItem">
									<span
										className="localNoteConnectionsLegendNode is-note"
										aria-hidden="true"
									/>
									Note
								</span>
								<span className="localNoteConnectionsLegendItem">
									<span
										className="localNoteConnectionsLegendNode is-tag"
										aria-hidden="true"
									/>
									Tag
								</span>
								<span className="localNoteConnectionsLegendItem">
									<span
										className="localNoteConnectionsLegendEdge is-link"
										aria-hidden="true"
									/>
									Note link
								</span>
								<span className="localNoteConnectionsLegendItem">
									<span
										className="localNoteConnectionsLegendEdge is-tag-link"
										aria-hidden="true"
									/>
									Shares tag
								</span>
							</div>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
