import { PointerActivationConstraints } from "@dnd-kit/dom";
import {
	DragDropProvider,
	type DragEndEvent,
	PointerSensor,
} from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { memo, useCallback, useRef } from "react";
import type { MouseEvent, MutableRefObject } from "react";
import { useShortcutBindings } from "../../hooks/useShortcutBindings";
import { ALL_DOCS_TAB_ID } from "../../lib/allDocs";
import { CALENDAR_TAB_ID } from "../../lib/calendar";
import { DATABASES_TAB_ID } from "../../lib/databases";
import { formatShortcutForPlatform } from "../../lib/shortcuts/platform";
import { TASKS_TAB_ID } from "../../lib/tasksView";
import type { FsEntry } from "../../lib/tauri";
import { TEMPLATES_TAB_ID } from "../../lib/templatesView";
import { isMarkdownPath } from "../../utils/path";
import { onWindowDragMouseDown } from "../../utils/window";
import { ActiveFileTitle } from "./ActiveFileTitle";
import { MainTabsBreadcrumbs } from "./MainTabsBreadcrumbs";
import type { WorkspaceTab } from "./useTabManager";

interface TabBarProps {
	tabs: WorkspaceTab[];
	rootEntries: FsEntry[];
	childrenByDir: Record<string, FsEntry[] | undefined>;
	activeTabId: string | null;
	activeTabPath: string | null;
	useWindowBackground?: boolean;
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
	onStartRenamePath: (path: string) => void;
	onReorder: (fromTabId: string, toTabId: string) => void;
}

const MAIN_TAB_DND_TYPE = "main-tab";
const MAIN_TAB_DND_GROUP = "main-tabs";
const MAIN_TAB_SENSORS = [
	PointerSensor.configure({
		activationConstraints: [
			new PointerActivationConstraints.Distance({ value: 5 }),
		],
	}),
];

function isPathSpecial(path: string): boolean {
	return (
		path === ALL_DOCS_TAB_ID ||
		path === CALENDAR_TAB_ID ||
		path === DATABASES_TAB_ID ||
		path === TASKS_TAB_ID ||
		path === TEMPLATES_TAB_ID
	);
}

export function TabBar({
	tabs,
	rootEntries,
	childrenByDir,
	activeTabId,
	activeTabPath,
	useWindowBackground = false,
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
	onStartRenamePath,
	onReorder,
}: TabBarProps) {
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
			if (tab.target === ALL_DOCS_TAB_ID) return "All Notes";
			if (tab.target === CALENDAR_TAB_ID) return "Calendar";
			if (tab.target === DATABASES_TAB_ID) return "Collections";
			if (tab.target === TASKS_TAB_ID) return "Tasks";
			if (tab.target === TEMPLATES_TAB_ID) return "Templates";
			const parts = (tab.target ?? "").split("/").filter(Boolean);
			const rawName = parts[parts.length - 1] ?? tab.target ?? "Untitled";
			return compactLabel(stripFileExtension(rawName));
		},
		[compactLabel, stripFileExtension],
	);

	const showTabs = tabs.length > 1;
	const newTabShortcut = getBinding("new-tab");
	const activeMarkdownPath =
		activeTabPath &&
		!isPathSpecial(activeTabPath) &&
		isMarkdownPath(activeTabPath)
			? activeTabPath
			: null;
	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			suppressClickRef.current = true;
			window.setTimeout(() => {
				suppressClickRef.current = false;
			}, 0);
			if (event.canceled) return;

			const { source, target } = event.operation;
			const sourceTabId =
				typeof source?.data.tabId === "string" ? source.data.tabId : null;
			const targetTabId =
				typeof target?.data.tabId === "string" ? target.data.tabId : null;
			if (!sourceTabId || !targetTabId || sourceTabId === targetTabId) return;

			onReorder(sourceTabId, targetTabId);
		},
		[onReorder],
	);

	return (
		<div
			className="mainTabsBarWrap"
			data-tauri-drag-region
			onMouseDown={onWindowDragMouseDown}
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
					<>
						<DragDropProvider onDragEnd={handleDragEnd}>
							<div className="mainTabsStrip">
								{tabs.map((tab, index) => (
									<TabItem
										key={tab.id}
										tab={tab}
										index={index}
										label={tabLabel(tab)}
										isActive={tab.id === activeTabId}
										suppressClickRef={suppressClickRef}
										onPrefetchTab={onPrefetchTab}
										onSelectTab={onSelectTab}
										onCloseTab={onCloseTab}
										onStartRenamePath={onStartRenamePath}
									/>
								))}
							</div>
						</DragDropProvider>
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
					</>
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
	tab,
	index,
	label,
	isActive,
	suppressClickRef,
	onSelectTab,
	onPrefetchTab,
	onCloseTab,
	onStartRenamePath,
}: {
	tab: WorkspaceTab;
	index: number;
	label: string;
	isActive: boolean;
	suppressClickRef: MutableRefObject<boolean>;
	onSelectTab: (tabId: string) => void;
	onPrefetchTab: (target: string | null) => void;
	onCloseTab: (tabId: string) => void;
	onStartRenamePath: (path: string) => void;
}) {
	const { ref, handleRef, isDragging, isDropTarget } = useSortable({
		id: tab.id,
		index,
		group: MAIN_TAB_DND_GROUP,
		type: MAIN_TAB_DND_TYPE,
		accept: MAIN_TAB_DND_TYPE,
		sensors: MAIN_TAB_SENSORS,
		data: { tabId: tab.id },
		transition: { duration: 160, easing: "ease" },
	});
	const handleSelect = useCallback(() => {
		if (suppressClickRef.current) return;
		onSelectTab(tab.id);
	}, [onSelectTab, suppressClickRef, tab.id]);
	const handleClose = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			event.stopPropagation();
			onCloseTab(tab.id);
		},
		[onCloseTab, tab.id],
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
			data-dragging={isDragging ? "true" : undefined}
			data-drop-target={isDropTarget ? "true" : undefined}
		>
			<button
				type="button"
				className="mainTabClose"
				onClick={handleClose}
				aria-label={`Close ${label}`}
			>
				<span className="mainTabCloseGlyph" aria-hidden>
					×
				</span>
			</button>
			<button
				ref={handleRef}
				type="button"
				className={`mainTab ${isActive ? "is-active" : ""}`}
				onClick={handleSelect}
				onMouseEnter={() => onPrefetchTab(tab.target)}
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
