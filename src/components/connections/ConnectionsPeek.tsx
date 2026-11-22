import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { basename, parentDir } from "../../utils/path";
import type { ConnectionsGraph } from "./connectionsGraph";
import type { ConnectionsHover } from "./connectionsInteractions";
import { useConnectionsView } from "./ConnectionsViewContext";
import { useConnectionsNotePreview } from "./useConnectionsNotePreview";

const HOVER_PEEK_WIDTH_PX = 250;
const HOVER_PEEK_GAP_PX = 12;
const HOVER_PEEK_MARGIN_PX = 12;
const HOVER_PEEK_HEIGHT_PX = 160;

function countNotes(graph: ConnectionsGraph, ids: readonly string[]) {
	return ids.filter((id) => graph.getNodeAttribute(id, "kind") === "note").length;
}

function peekMeta(graph: ConnectionsGraph, id: string, t: TFunction<"shell">): string[] {
	if (graph.getNodeAttribute(id, "kind") === "tag") {
		return [t("connections.peek.notes", { count: countNotes(graph, graph.neighbors(id)) })];
	}
	const links = countNotes(graph, graph.outNeighbors(id));
	const backlinks = countNotes(graph, graph.inNeighbors(id));
	const folder = basename(parentDir(id));
	return [
		...(links > 0 ? [t("connections.peek.links", { count: links })] : []),
		...(backlinks > 0 ? [t("connections.peek.backlinks", { count: backlinks })] : []),
		...(links + backlinks === 0 ? [t("connections.peek.noLinks")] : []),
		...(folder ? [folder] : []),
	];
}

export function ConnectionsPeekBody({ id, hint }: { id: string; hint?: string }) {
	const { t } = useTranslation("shell");
	const { graph } = useConnectionsView();
	const isNote = graph?.getNodeAttribute(id, "kind") === "note";
	const preview = useConnectionsNotePreview(id, isNote);
	if (!graph) return null;
	const label = graph.getNodeAttribute(id, "label");
	const meta = [...peekMeta(graph, id, t), ...(hint ? [hint] : [])];
	return (
		<>
			<h2 className="connectionsPeekTitle">
				{isNote || label.startsWith("#") ? label : `#${label}`}
			</h2>
			{preview.data ? <p className="connectionsPeekPreview">{preview.data}</p> : null}
			{preview.isError ? (
				<p className="connectionsPeekPreview" role="alert">
					{t("connections.peek.previewFailed")}
				</p>
			) : null}
			<div className="connectionsPeekMeta">
				{meta.map((item) => (
					<span key={item}>{item}</span>
				))}
			</div>
		</>
	);
}

function hoverPeekPosition({ x, y, radius, viewWidth, viewHeight }: ConnectionsHover) {
	const right = x + radius + HOVER_PEEK_GAP_PX;
	const fitsRight = right + HOVER_PEEK_WIDTH_PX + HOVER_PEEK_MARGIN_PX <= viewWidth;
	const left = fitsRight ? right : x - radius - HOVER_PEEK_GAP_PX - HOVER_PEEK_WIDTH_PX;
	const maxTop = viewHeight - HOVER_PEEK_HEIGHT_PX - HOVER_PEEK_MARGIN_PX;
	const top = Math.max(HOVER_PEEK_MARGIN_PX, Math.min(maxTop, y - radius));
	return {
		left: Math.max(HOVER_PEEK_MARGIN_PX, left),
		top: `calc(var(--header-height) + ${top}px)`,
		width: HOVER_PEEK_WIDTH_PX,
		maxHeight: HOVER_PEEK_HEIGHT_PX,
	};
}

export function ConnectionsHoverPeek() {
	const { t } = useTranslation("shell");
	const { hover, selectedId } = useConnectionsView();
	if (!hover || hover.id === selectedId) return null;
	return (
		<div
			className="connectionsFloat connectionsPeek connectionsHoverPeek"
			style={hoverPeekPosition(hover)}
			aria-hidden="true"
		>
			<ConnectionsPeekBody id={hover.id} hint={t("connections.peek.clickToFocus")} />
		</div>
	);
}
