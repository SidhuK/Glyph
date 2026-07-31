import type { Draggable } from "@dnd-kit/dom";
import { PointerActivationConstraints } from "@dnd-kit/dom";
import {
	type DragEndEvent,
	PointerSensor,
	useDragDropMonitor,
} from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { Cancel01Icon, PinIcon, PinOffIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useCallback, useMemo, useRef } from "react";
import type { MouseEvent, MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import { useHoverPrefetch } from "../../hooks/useHoverPrefetch";
import { useShortcutBindings } from "../../hooks/useShortcutBindings";
import { ACTIVITY_TIMELINE_TAB_ID } from "../../lib/activityTimeline";
import { ALL_DOCS_TAB_ID } from "../../lib/allDocs";
import { DATABASES_TAB_ID } from "../../lib/databases";
import { PINNED_DOCS_TAB_ID } from "../../lib/pinnedDocs";
import { formatShortcutForPlatform } from "../../lib/shortcuts/platform";
import { SPACE_CONNECTIONS_TAB_ID } from "../../lib/spaceConnections";
import type { FsEntry } from "../../lib/tauri";
import { isMarkdownPath } from "../../utils/path";
import { onWindowDragMouseDown } from "../../utils/window";
import { ActiveFileTitle } from "./ActiveFileTitle";
import { MainTabsBreadcrumbs } from "./MainTabsBreadcrumbs";
import { MAIN_TAB_DND_TYPE } from "./splitEditorDnd";
import type { WorkspaceTab } from "./useTabManager";

interface TabBarProps {
	paneId: string;
	tabs: WorkspaceTab[];
	rootEntries: FsEntry[];
	childrenByDir: Record<string, FsEntry[] | undefined>;
	activeTabId: string | null;
	activeTabPath: string | null;
	useWindowBackground?: boolean;
	allowWindowDrag?: boolean;
	canGoBack: boolean;
	canGoForward: boolean;
	onGoBack: () => void;
	onGoForward: () => void;
	onOpenBlankTab: () => void;
	onPrefetchTab: (target: string | null) => void;
	onNavigateBreadcrumbPath: (dirPath: string) => void;
	onLoadBreadcrumbDir: (dirPath: string) => Promise<void>;
	onOpenBreadcrumbFile: (relPath: string) => Promise<void>;
	onRenameFile: (path: string, nextName: string) => Promise<string | null>;
	onSelectTab: (tabId: string) => void;
	onCloseTab: (tabId: string) => void;
	onToggleTabPinned: (tabId: string) => void;
	onStartRenamePath: (path: string) => void;
	onReorder: (fromTabId: string, toTabId: string) => void;
}

const MAIN_TAB_SENSORS = [
	PointerSensor.configure({
		activationConstraints: [
			new PointerActivationConstraints.Distance({ value: 5 }),
		],
	}),
];
const DRAG_CLICK_SUPPRESSION_DELAY_MS = 0;

function isPathSpecial(path: string): boolean {
	return (
		path === ALL_DOCS_TAB_ID ||
		path === ACTIVITY_TIMELINE_TAB_ID ||
		path === DATABASES_TAB_ID ||
		path === PINNED_DOCS_TAB_ID ||
		path === SPACE_CONNECTIONS_TAB_ID
	);
}

export function TabBar({
	paneId,
	tabs,
	rootEntries,
	childrenByDir,
	activeTabId,
	activeTabPath,
	useWindowBackground = false,
	allowWindowDrag = true,
	canGoBack,
	canGoForward,
	onGoBack,
	onGoForward,
	onOpenBlankTab,
	onPrefetchTab,
	onNavigateBreadcrumbPath,
	onLoadBreadcrumbDir,
	onOpenBreadcrumbFile,
	onRenameFile,
	onSelectTab,
	onCloseTab,
	onToggleTabPinned,
	onStartRenamePath,
	onReorder,
}: TabBarProps) {
	const { t } = useTranslation("shell");
	const { getBinding } = useShortcutBindings();
	const suppressClickRef = useRef(false);
	const stripFileExtension = useCallback((name: string) => {
		if (!name || name.startsWith(".")) return name;
		const withoutExt = name.replace(/\.[^./]+$/, "");
		return withoutExt || name;
	}, []);

	const compactLabel = useCallback((value: string) => {
		const text = value.trim();
		if (text.length <= 20) return text;
		return `${text.slice(0, 17)}...`;
	}, []);

	const tabLabel = useCallback(
		(tab: WorkspaceTab) => {
			if (tab.kind === "blank") return "New Tab";
			if (tab.target === ALL_DOCS_TAB_ID) return t("tabs.allNotes");
			if (tab.target === ACTIVITY_TIMELINE_TAB_ID) return t("tabs.allNotes");
			if (tab.target === DATABASES_TAB_ID) return t("tabs.collections");
			if (tab.target === PINNED_DOCS_TAB_ID) return t("tabs.pinned");
			if (tab.target === SPACE_CONNECTIONS_TAB_ID)
				return t("sidebar.connections");
			const parts = (tab.target ?? "").split("/").filter(Boolean);
			const rawName = parts[parts.length - 1] ?? tab.target ?? "Untitled";
			return compactLabel(stripFileExtension(rawName));
		},
		[compactLabel, stripFileExtension, t],
	);

	const showTabs = tabs.length > 0;
	const newTabShortcut = getBinding("new-tab");
	const activeMarkdownPath =
		activeTabPath &&
		!isPathSpecial(activeTabPath) &&
		isMarkdownPath(activeTabPath)
			? activeTabPath
			: null;
	// Reorder only when one of this pane's tabs is dropped onto another tab in
	// the same pane. Drops onto the editor body resolve to a pane droppable
	// instead, which SplitEditorLayout handles.
	const dragDropHandlers = useMemo(
		() => ({
			onDragEnd(event: DragEndEvent) {
				const { source, target } = event.operation;
				const sourceTabId =
					typeof source?.data.tabId === "string" ? source.data.tabId : null;
				const sourcePaneId =
					typeof source?.data.paneId === "string" ? source.data.paneId : null;
				if (!sourceTabId || sourcePaneId !== paneId) return;

				suppressClickRef.current = true;
				window.setTimeout(() => {
					suppressClickRef.current = false;
				}, DRAG_CLICK_SUPPRESSION_DELAY_MS);
				if (event.canceled) return;

				const targetTabId =
					typeof target?.data.tabId === "string" ? target.data.tabId : null;
				const targetPaneId =
					typeof target?.data.paneId === "string" ? target.data.paneId : null;
				if (!targetTabId || targetPaneId !== paneId) return;
				if (targetTabId === sourceTabId) return;

				onReorder(sourceTabId, targetTabId);
			},
		}),
		[onReorder, paneId],
	);
	useDragDropMonitor(dragDropHandlers);

	return (
		<div
			className="mainTabsBarWrap"
			data-tauri-drag-region={allowWindowDrag ? "" : undefined}
			onMouseDown={allowWindowDrag ? onWindowDragMouseDown : undefined}
		>
			<div
				className="mainTabsBar"
				data-empty-state={useWindowBackground ? "true" : "false"}
			>
				<div className="mainTabNavControls">
					<button
						type="button"
						className="mainTabNavBtn"
						onClick={onGoBack}
						disabled={!canGoBack}
						title="Go back"
						aria-label="Go back"
					>
						←
					</button>
					<button
						type="button"
						className="mainTabNavBtn"
						onClick={onGoForward}
						disabled={!canGoForward}
						title="Go forward"
						aria-label="Go forward"
					>
						→
					</button>
				</div>
				<ActiveFileTitle
					path={activeMarkdownPath}
					onRenameFile={onRenameFile}
				/>
				{showTabs ? (
					<div className="mainTabsStrip">
						<div className="mainTabsStripTabs">
							{tabs.map((tab, index) => (
								<TabItem
									key={tab.id}
									paneId={paneId}
									tab={tab}
									index={index}
									label={tabLabel(tab)}
									isActive={tab.id === activeTabId}
									suppressClickRef={suppressClickRef}
									onPrefetchTab={onPrefetchTab}
									onSelectTab={onSelectTab}
									onCloseTab={onCloseTab}
									onToggleTabPinned={onToggleTabPinned}
									onStartRenamePath={onStartRenamePath}
								/>
							))}
						</div>
						<button
							type="button"
							className="mainTabAdd"
							onClick={onOpenBlankTab}
							title={`Open blank tab${
								newTabShortcut
									? ` (${formatShortcutForPlatform(newTabShortcut)})`
									: ""
							}`}
							aria-label="Open blank tab"
						>
							+
						</button>
					</div>
				) : null}
			</div>
			<MainTabsBreadcrumbs
				activeTabPath={activeTabPath}
				rootEntries={rootEntries}
				childrenByDir={childrenByDir}
				onNavigateBreadcrumbPath={onNavigateBreadcrumbPath}
				onLoadBreadcrumbDir={onLoadBreadcrumbDir}
				onOpenBreadcrumbFile={onOpenBreadcrumbFile}
			/>
		</div>
	);
}

const TabItem = memo(function TabItem({
	paneId,
	tab,
	index,
	label,
	isActive,
	suppressClickRef,
	onSelectTab,
	onPrefetchTab,
	onCloseTab,
	onToggleTabPinned,
	onStartRenamePath,
}: {
	paneId: string;
	tab: WorkspaceTab;
	index: number;
	label: string;
	isActive: boolean;
	suppressClickRef: MutableRefObject<boolean>;
	onSelectTab: (tabId: string) => void;
	onPrefetchTab: (target: string | null) => void;
	onCloseTab: (tabId: string) => void;
	onToggleTabPinned: (tabId: string) => void;
	onStartRenamePath: (path: string) => void;
}) {
	const { t } = useTranslation("shell");
	// Only accept tabs from this pane, so a tab dragged in from another pane
	// falls through to the pane droppable and moves panes instead of sorting.
	const acceptSamePaneTab = useCallback(
		(source: Draggable) => source.data?.paneId === paneId,
		[paneId],
	);
	const { ref, handleRef, isDragging, isDropTarget } = useSortable({
		id: tab.id,
		index,
		// Per-pane group: a single shared group would collide indices across panes.
		group: `main-tabs:${paneId}`,
		type: MAIN_TAB_DND_TYPE,
		accept: acceptSamePaneTab,
		sensors: MAIN_TAB_SENSORS,
		data: { paneId, tabId: tab.id },
		transition: { duration: 160, easing: "ease" },
	});
	const { cancelHoverPrefetch, hoverPrefetchProps } = useHoverPrefetch(() => {
		onPrefetchTab(tab.target);
	});
	const handleSelect = useCallback(() => {
		cancelHoverPrefetch();
		if (suppressClickRef.current) return;
		onSelectTab(tab.id);
	}, [cancelHoverPrefetch, onSelectTab, suppressClickRef, tab.id]);
	const handleClose = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			event.stopPropagation();
			onCloseTab(tab.id);
		},
		[onCloseTab, tab.id],
	);
	const handleUnpin = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			event.stopPropagation();
			onToggleTabPinned(tab.id);
		},
		[onToggleTabPinned, tab.id],
	);
	const handleDoubleClick = useCallback(() => {
		if (!tab.target || tab.kind === "blank" || isPathSpecial(tab.target))
			return;
		onStartRenamePath(tab.target);
	}, [onStartRenamePath, tab.kind, tab.target]);

	const title =
		tab.kind === "blank"
			? label
			: tab.target && isPathSpecial(tab.target)
				? label
				: (tab.target ?? label);

	return (
		<div
			ref={ref}
			className="mainTabWrap"
			data-pinned={tab.isPinned ? "true" : undefined}
			data-dragging={isDragging ? "true" : undefined}
			data-drop-target={isDropTarget ? "true" : undefined}
		>
			{tab.isPinned ? (
				<button
					type="button"
					className="mainTabPin"
					onClick={handleUnpin}
					title={t("tabs.unpinNamed", { label })}
					aria-label={t("tabs.unpinNamed", { label })}
				>
					<HugeiconsIcon
						icon={PinIcon}
						size={13}
						strokeWidth={1.5}
						className="mainTabPinIcon mainTabPinIconPinned"
					/>
					<HugeiconsIcon
						icon={PinOffIcon}
						size={13}
						strokeWidth={1.5}
						className="mainTabPinIcon mainTabPinIconUnpin"
					/>
				</button>
			) : (
				<button
					type="button"
					className="mainTabClose"
					onClick={handleClose}
					aria-label={`Close ${label}`}
				>
					<HugeiconsIcon
						icon={Cancel01Icon}
						size={13}
						strokeWidth={1.5}
						aria-hidden="true"
					/>
				</button>
			)}
			<button
				ref={handleRef}
				type="button"
				className={`mainTab ${isActive ? "is-active" : ""}`}
				onClick={handleSelect}
				{...hoverPrefetchProps}
				onFocus={() => onPrefetchTab(tab.target)}
				title={title}
				onDoubleClick={handleDoubleClick}
			>
				<span className="mainTabText">
					<span className="mainTabLabel">{label}</span>
				</span>
			</button>
		</div>
	);
});
