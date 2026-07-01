import { LoaderCircle, Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSpace } from "../../contexts";
import type { SpaceConnections } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { Toggle } from "../base/toggle/toggle";
import {
	dispatchTagClick,
	dispatchWikiLinkClick,
} from "../editor/markdown/editorEvents";
import { Button } from "../ui/shadcn/button";
import { useSigmaConnections } from "./useSigmaConnections";
import { useSpaceConnectionsGraph } from "./useSpaceConnectionsGraph";

const LARGE_GRAPH_NOTE_THRESHOLD = 5_000;

async function warnAboutLargeGraph(payload: SpaceConnections) {
	const noteCount = payload.nodes.length;
	if (noteCount <= LARGE_GRAPH_NOTE_THRESHOLD) return;

	const { i18n } = await import("../../i18n");
	const { message } = await import("@tauri-apps/plugin-dialog");
	await message(
		i18n.t("connections.largeGraphBody", {
			ns: "ui",
			count: noteCount,
		}),
		{
			title: i18n.t("connections.largeGraphTitle", { ns: "ui" }),
			kind: "warning",
			okLabel: i18n.t("connections.continue", { ns: "ui" }),
		},
	);
}

function openNote(nodeId: string) {
	dispatchWikiLinkClick({
		raw: `[[${nodeId}]]`,
		target: nodeId,
		alias: null,
		anchorKind: "none",
		anchor: null,
		unresolved: false,
	});
}

function openTagSearch(_tagId: string, label: string) {
	dispatchTagClick({ tag: label, tagOnly: true });
}

interface SpaceConnectionsControlsProps {
	showUnconnectedNotes: boolean;
	onShowUnconnectedNotesChange: (checked: boolean) => void;
	t: TFunction<"ui">;
}

function SpaceConnectionsControls({
	showUnconnectedNotes,
	onShowUnconnectedNotesChange,
	t,
}: SpaceConnectionsControlsProps) {
	return (
		<div className="spaceConnectionsControls">
			<Toggle
				checked={showUnconnectedNotes}
				onCheckedChange={onShowUnconnectedNotesChange}
				label={t("connections.showUnconnectedNotes")}
				size="sm"
			/>
			<div
				className="localNoteConnectionsLegend is-space"
				aria-label={t("connections.legendAriaLabel")}
			>
				<span className="localNoteConnectionsLegendItem">
					<span
						className="localNoteConnectionsLegendNode is-note"
						aria-hidden="true"
					/>
					{t("connections.note")}
				</span>
				<span className="localNoteConnectionsLegendItem">
					<span
						className="localNoteConnectionsLegendNode is-tag"
						aria-hidden="true"
					/>
					{t("connections.tag")}
				</span>
			</div>
		</div>
	);
}

export function SpaceConnectionsView() {
	const { t } = useTranslation("ui");
	const { spacePath } = useSpace();
	const [payload, setPayload] = useState<SpaceConnections | null>(null);
	const [dataLoading, setDataLoading] = useState(true);
	const [error, setError] = useState("");
	const [showUnconnectedNotes, setShowUnconnectedNotes] = useState(false);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const activeSpacePathRef = useRef(spacePath);
	const requestIdRef = useRef(0);
	activeSpacePathRef.current = spacePath;

	const loadConnections = useCallback(() => {
		const requestSpacePath = spacePath;
		const requestId = ++requestIdRef.current;
		setDataLoading(true);
		setError("");

		void invoke("space_connections", {})
			.then(async (nextGraph) => {
				if (
					requestId !== requestIdRef.current ||
					activeSpacePathRef.current !== requestSpacePath
				)
					return;
				await warnAboutLargeGraph(nextGraph);
				if (
					requestId !== requestIdRef.current ||
					activeSpacePathRef.current !== requestSpacePath
				)
					return;
				setPayload(nextGraph);
			})
			.catch((cause) => {
				if (
					requestId !== requestIdRef.current ||
					activeSpacePathRef.current !== requestSpacePath
				)
					return;
				setPayload(null);
				setError(cause instanceof Error ? cause.message : String(cause));
			})
			.finally(() => {
				if (
					requestId === requestIdRef.current &&
					activeSpacePathRef.current === requestSpacePath
				) {
					setDataLoading(false);
				}
			});

		return () => {
			requestIdRef.current += 1;
		};
	}, [spacePath]);

	useEffect(() => loadConnections(), [loadConnections]);

	const { filteredPayload, graph, layoutError, layoutLoading } =
		useSpaceConnectionsGraph(payload, showUnconnectedNotes);
	const loading = dataLoading || layoutLoading;
	const visibleError = error || layoutError;

	useSigmaConnections({
		graph,
		containerRef,
		variant: "space",
		enabled: Boolean(graph && !loading && !visibleError),
		onNoteOpen: openNote,
		onTagActivate: openTagSearch,
	});

	if (dataLoading) {
		return (
			<section className="spaceConnectionsHost relative h-full min-h-0 flex-1 overflow-hidden">
				<div
					className="localNoteConnectionsViewport absolute inset-0"
					aria-hidden="true"
				/>
				<div className="absolute inset-0 flex items-center justify-center">
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<HugeiconsIcon
							icon={LoaderCircle}
							className="animate-spin"
							size="var(--icon-sm)"
							strokeWidth={0.9}
						/>
						{t("connections.loadingNotes")}
					</div>
				</div>
			</section>
		);
	}

	if (layoutLoading) {
		return (
			<section className="spaceConnectionsHost relative h-full min-h-0 flex-1 overflow-hidden">
				<div
					className="localNoteConnectionsViewport absolute inset-0"
					aria-hidden="true"
				/>
				<SpaceConnectionsControls
					showUnconnectedNotes={showUnconnectedNotes}
					onShowUnconnectedNotesChange={setShowUnconnectedNotes}
					t={t}
				/>
				<div className="absolute inset-0 flex items-center justify-center">
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<HugeiconsIcon
							icon={LoaderCircle}
							className="animate-spin"
							size="var(--icon-sm)"
							strokeWidth={0.9}
						/>
						{t("connections.arranging")}
					</div>
				</div>
			</section>
		);
	}

	if (visibleError) {
		return (
			<div className="flex h-full min-h-0 flex-1 items-center justify-center p-6">
				<div className="flex max-w-md flex-col items-center gap-3 text-center">
					<p className="text-sm text-muted-foreground">
						{t("connections.loadError", { message: visibleError })}
					</p>
					<Button type="button" size="sm" onClick={loadConnections}>
						<HugeiconsIcon
							icon={Refresh01Icon}
							data-icon="inline-start"
							size="var(--icon-md)"
							strokeWidth={0.9}
						/>
						{t("connections.retry")}
					</Button>
				</div>
			</div>
		);
	}

	if (!payload || payload.nodes.length === 0) {
		return (
			<div className="flex h-full min-h-0 flex-1 items-center justify-center p-6">
				<p className="text-sm text-muted-foreground">
					{t("connections.noNotes")}
				</p>
			</div>
		);
	}

	if (!filteredPayload || filteredPayload.nodes.length === 0) {
		return (
			<section className="spaceConnectionsHost relative h-full min-h-0 flex-1 overflow-hidden">
				<div
					className="localNoteConnectionsViewport absolute inset-0"
					aria-hidden="true"
				/>
				<SpaceConnectionsControls
					showUnconnectedNotes={showUnconnectedNotes}
					onShowUnconnectedNotesChange={setShowUnconnectedNotes}
					t={t}
				/>
				<p className="relative z-1 flex h-full items-center justify-center text-sm text-muted-foreground">
					{t("connections.noConnectedNotes")}
				</p>
			</section>
		);
	}

	return (
		<section className="spaceConnectionsHost relative h-full min-h-0 flex-1 overflow-hidden">
			<div
				ref={containerRef}
				className="localNoteConnectionsViewport absolute inset-0"
				aria-label={t("connections.viewportAriaLabel")}
			/>
			<SpaceConnectionsControls
				showUnconnectedNotes={showUnconnectedNotes}
				onShowUnconnectedNotesChange={setShowUnconnectedNotes}
				t={t}
			/>
		</section>
	);
}
