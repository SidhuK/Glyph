import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { LoaderCircle, Refresh01Icon } from "@hugeicons/core-free-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type KeyboardEvent, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSpace } from "../../contexts";
import { i18n } from "../../i18n";
import {
	type ConnectionsGraphOptions,
	DEFAULT_CONNECTIONS_GRAPH_OPTIONS,
	connectionsLinkOpacity,
	connectionsLinkThicknessScale,
	connectionsNodeSizeScale,
} from "../../lib/connectionsGraphOptions";
import {
	type AppSettings,
	SPACE_SETTINGS,
	loadSettings,
	writeSpaceSetting,
} from "../../lib/settings";
import type { SpaceConnections } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import {
	dispatchTagClick,
	dispatchWikiLinkClick,
} from "../editor/markdown/editorEvents";
import { Button } from "../ui/shadcn/button";
import { SpaceConnectionsToolbar } from "./SpaceConnectionsToolbar";
import type { ConnectionsGraph } from "./connectionsGraph";
import { useSigmaConnections } from "./useSigmaConnections";
import { useSpaceConnectionsGraph } from "./useSpaceConnectionsGraph";

const LARGE_GRAPH_NOTE_THRESHOLD = 5_000;
const CONNECTIONS_QUERY_ROOT = "space-connections";
const CONNECTIONS_SETTINGS_QUERY_ROOT = "space-connections-settings";

async function warnAboutLargeGraph(payload: SpaceConnections) {
	const noteCount = payload.nodes.length;
	if (noteCount <= LARGE_GRAPH_NOTE_THRESHOLD) return;

	const { message } = await import("@tauri-apps/plugin-dialog");
	await message(
		i18n.t("shell:connections.largeGraphBody", { count: noteCount }),
		{
			title: i18n.t("shell:connections.largeGraphTitle"),
			kind: "warning",
			okLabel: i18n.t("shell:connections.largeGraphContinue"),
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

function nodeMatchesSearch(id: string, label: string, needle: string) {
	if (label.toLocaleLowerCase().includes(needle)) return true;
	const path = id.replace(/\\/g, "/").toLocaleLowerCase();
	if (path.includes(needle)) return true;
	const stem = (path.split("/").pop() ?? "").replace(/\.md$/i, "");
	return stem.includes(needle);
}

function searchMatchIds(graph: ConnectionsGraph, query: string) {
	const needle = query.trim().toLocaleLowerCase();
	if (!needle) return null;
	const matches = new Set<string>();
	for (const id of graph.nodes()) {
		const label = graph.getNodeAttribute(id, "label");
		if (nodeMatchesSearch(id, label, needle)) matches.add(id);
	}
	return matches;
}

function SpaceConnectionsLegend({
	showDaily,
	showWeekly,
}: {
	showDaily: boolean;
	showWeekly: boolean;
}) {
	const { t } = useTranslation("shell");
	return (
		<div
			className="localNoteConnectionsLegend is-space"
			aria-label={t("connections.legendAria")}
		>
			<span className="localNoteConnectionsLegendItem">
				<span
					className="localNoteConnectionsLegendNode is-note"
					aria-hidden="true"
				/>
				{t("connections.legendNote")}
			</span>
			{showDaily ? (
				<span className="localNoteConnectionsLegendItem">
					<span
						className="localNoteConnectionsLegendNode is-daily"
						aria-hidden="true"
					/>
					{t("connections.legendDaily")}
				</span>
			) : null}
			{showWeekly ? (
				<span className="localNoteConnectionsLegendItem">
					<span
						className="localNoteConnectionsLegendNode is-weekly"
						aria-hidden="true"
					/>
					{t("connections.legendWeekly")}
				</span>
			) : null}
			<span className="localNoteConnectionsLegendItem">
				<span
					className="localNoteConnectionsLegendNode is-tag"
					aria-hidden="true"
				/>
				{t("connections.legendTag")}
			</span>
		</div>
	);
}

export function SpaceConnectionsView({
	focused = true,
}: {
	focused?: boolean;
}) {
	const { t } = useTranslation("shell");
	const { spacePath } = useSpace();
	const queryClient = useQueryClient();
	const containerRef = useRef<HTMLDivElement | null>(null);
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const scopedSpacePath = spacePath ?? "";

	const settingsQuery = useQuery({
		queryKey: [CONNECTIONS_SETTINGS_QUERY_ROOT, scopedSpacePath],
		enabled: Boolean(spacePath),
		queryFn: () => loadSettings({ spacePath: scopedSpacePath }),
	});
	const options =
		settingsQuery.data?.connectionsGraph ?? DEFAULT_CONNECTIONS_GRAPH_OPTIONS;
	const dailyNotesFolder = settingsQuery.data?.dailyNotes.folder ?? null;
	const weeklyNotesEnabled =
		settingsQuery.data?.dailyNotes.weeklyNotes === true;

	const optionsMutation = useMutation({
		mutationFn: (next: ConnectionsGraphOptions) =>
			writeSpaceSetting(SPACE_SETTINGS.connectionsGraph, next, {
				spacePath: scopedSpacePath,
			}),
		onMutate: async (next) => {
			const queryKey = [
				CONNECTIONS_SETTINGS_QUERY_ROOT,
				scopedSpacePath,
			] as const;
			await queryClient.cancelQueries({ queryKey });
			const previous = queryClient.getQueryData<AppSettings>(queryKey);
			queryClient.setQueryData<AppSettings>(queryKey, (current) =>
				current ? { ...current, connectionsGraph: next } : current,
			);
			return { previous, queryKey };
		},
		onError: (_cause, _next, context) => {
			if (!context) return;
			queryClient.setQueryData(context.queryKey, context.previous);
		},
	});

	const connectionsQuery = useQuery({
		queryKey: [CONNECTIONS_QUERY_ROOT, scopedSpacePath],
		enabled: Boolean(spacePath),
		queryFn: async () => {
			const payload = await invoke("space_connections");
			await warnAboutLargeGraph(payload);
			return payload;
		},
	});

	useTauriEvent("space:fs_changed", () => {
		void queryClient.invalidateQueries({
			queryKey: [CONNECTIONS_QUERY_ROOT, scopedSpacePath],
		});
	});
	useTauriEvent("settings:updated", () => {
		void queryClient.invalidateQueries({
			queryKey: [CONNECTIONS_SETTINGS_QUERY_ROOT, scopedSpacePath],
		});
	});

	const payload = connectionsQuery.data ?? null;
	const dataLoading = connectionsQuery.isPending;
	const error = connectionsQuery.error
		? connectionsQuery.error instanceof Error
			? connectionsQuery.error.message
			: String(connectionsQuery.error)
		: "";

	const { filteredPayload, graph, layoutError, layoutLoading } =
		useSpaceConnectionsGraph(
			payload,
			scopedSpacePath,
			options,
			dailyNotesFolder,
			weeklyNotesEnabled,
		);
	const loading = dataLoading || layoutLoading;
	const visibleError = error || layoutError;
	const display = useMemo(
		() => ({
			nodeSizeScale: connectionsNodeSizeScale(options.nodeSize),
			linkOpacity: connectionsLinkOpacity(options.linkOpacity),
			linkThicknessScale: connectionsLinkThicknessScale(options.linkThickness),
		}),
		[options.linkOpacity, options.linkThickness, options.nodeSize],
	);

	const overlay = useSigmaConnections({
		graph,
		containerRef,
		variant: "space",
		enabled: Boolean(graph && !loading && !visibleError),
		display,
		labelZoomThreshold: options.labelZoomThreshold,
		searchMatchIds: graph ? searchMatchIds(graph, searchQuery) : null,
		findShortcutEnabled: focused,
		onFindShortcut: () => {
			setSearchOpen(true);
			searchInputRef.current?.focus();
			searchInputRef.current?.select();
		},
		onNoteOpen: openNote,
		onTagActivate: openTagSearch,
	});

	const applySearch = (query: string) => {
		setSearchQuery(query);
		if (!graph) {
			overlay.current.setSearchMatches(null);
			return;
		}
		overlay.current.setSearchMatches(searchMatchIds(graph, query));
	};

	const handleHostKeyDown = (event: KeyboardEvent<HTMLElement>) => {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
			event.preventDefault();
			setSearchOpen(true);
			return;
		}
		if (event.key === "Escape" && searchOpen) {
			event.preventDefault();
			setSearchOpen(false);
			applySearch("");
		}
	};

	const toolbar = (
		<>
			<SpaceConnectionsToolbar
				searchOpen={searchOpen}
				searchQuery={searchQuery}
				onSearchOpenChange={(open) => {
					setSearchOpen(open);
					if (!open) applySearch("");
				}}
				onSearchQueryChange={applySearch}
				searchInputRef={searchInputRef}
				options={options}
				onOptionsChange={(next) => {
					optionsMutation.mutate(next);
					overlay.current.setDisplay({
						nodeSizeScale: connectionsNodeSizeScale(next.nodeSize),
						linkOpacity: connectionsLinkOpacity(next.linkOpacity),
						linkThicknessScale: connectionsLinkThicknessScale(
							next.linkThickness,
						),
					});
					overlay.current.setLabelZoomThreshold(next.labelZoomThreshold);
				}}
			/>
			<SpaceConnectionsLegend
				showDaily={dailyNotesFolder !== null}
				showWeekly={weeklyNotesEnabled && dailyNotesFolder !== null}
			/>
		</>
	);

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
						/>
						{t("connections.loading")}
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
				{toolbar}
				<div className="absolute inset-0 flex items-center justify-center">
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<HugeiconsIcon
							icon={LoaderCircle}
							className="animate-spin"
							size="var(--icon-sm)"
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
						{t("connections.loadFailed", { error: visibleError })}
					</p>
					<Button
						type="button"
						size="sm"
						onClick={() => void connectionsQuery.refetch()}
					>
						<HugeiconsIcon
							icon={Refresh01Icon}
							data-icon="inline-start"
							size="var(--icon-md)"
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
					{t("connections.empty")}
				</p>
			</div>
		);
	}

	if (!filteredPayload || filteredPayload.nodes.length === 0) {
		return (
			<section
				className="spaceConnectionsHost relative h-full min-h-0 flex-1 overflow-hidden"
				onKeyDown={handleHostKeyDown}
			>
				<div
					className="localNoteConnectionsViewport absolute inset-0"
					aria-hidden="true"
				/>
				{toolbar}
				<p className="relative z-1 flex h-full items-center justify-center text-sm text-muted-foreground">
					{t("connections.noConnected")}
				</p>
			</section>
		);
	}

	return (
		<section
			className="spaceConnectionsHost relative h-full min-h-0 flex-1 overflow-hidden"
			onKeyDown={handleHostKeyDown}
		>
			<div
				ref={containerRef}
				className="localNoteConnectionsViewport absolute inset-0"
				aria-label={t("connections.graphAria")}
			/>
			{toolbar}
		</section>
	);
}
