import { memo, useCallback, useState } from "react";
import type { DragEvent, MouseEvent } from "react";
import { ALL_DOCS_TAB_ID } from "../../lib/allDocs";
import { CALENDAR_TAB_ID } from "../../lib/calendar";
import { DATABASES_TAB_ID } from "../../lib/databases";
import { getShortcutTooltip } from "../../lib/shortcuts";
import { TEMPLATES_TAB_ID } from "../../lib/templatesView";
import type { WorkspaceTab } from "./useTabManager";

interface TabBarProps {
	tabs: WorkspaceTab[];
	activeTabId: string | null;
	activeTabPath: string | null;
	dragTabId: string | null;
	useWindowBackground?: boolean;
	onOpenBlankTab: () => void;
	onSelectTab: (tabId: string) => void;
	onCloseTab: (tabId: string) => void;
	onDragStart: (tabId: string) => void;
	onDragEnd: () => void;
	onReorder: (fromTabId: string, toTabId: string) => void;
}

function isPathSpecial(path: string): boolean {
	return (
		path === ALL_DOCS_TAB_ID ||
		path === CALENDAR_TAB_ID ||
		path === DATABASES_TAB_ID ||
		path === TEMPLATES_TAB_ID
	);
}

export function TabBar({
	tabs,
	activeTabId,
	activeTabPath,
	dragTabId,
	useWindowBackground = false,
	onOpenBlankTab,
	onSelectTab,
	onCloseTab,
	onDragStart,
	onDragEnd,
	onReorder,
}: TabBarProps) {
	const stripFileExtension = useCallback((name: string) => {
		if (!name || name.startsWith(".")) return name;
		const withoutExt = name.replace(/\.[^./]+$/, "");
		return withoutExt || name;
	}, []);

	const tabLabel = useCallback(
		(tab: WorkspaceTab) => {
			if (tab.kind === "blank") return "New Tab";
			if (tab.target === ALL_DOCS_TAB_ID) return "All Notes";
			if (tab.target === CALENDAR_TAB_ID) return "Calendar";
			if (tab.target === DATABASES_TAB_ID) return "Collections";
			if (tab.target === TEMPLATES_TAB_ID) return "Templates";
			const parts = (tab.target ?? "").split("/").filter(Boolean);
			const rawName = parts[parts.length - 1] ?? tab.target ?? "Untitled";
			return stripFileExtension(rawName);
		},
		[stripFileExtension],
	);

	const [hovered, setHovered] = useState(false);
	const breadcrumbSegments =
		activeTabPath && !isPathSpecial(activeTabPath)
			? activeTabPath.split("/").filter(Boolean)
			: [];

	return (
		<div
			className="mainTabsBarWrap"
			onPointerEnter={() => setHovered(true)}
			onPointerLeave={() => setHovered(false)}
		>
			<div
				className="mainTabsBar"
				data-empty-state={useWindowBackground ? "true" : "false"}
			>
				<div className="mainTabsSide" />
				<div className="mainTabsCenter">
					<div className="mainTabsStrip">
						{tabs.map((tab) => (
							<TabItem
								key={tab.id}
								tab={tab}
								label={tabLabel(tab)}
								isActive={tab.id === activeTabId}
								dragTabId={dragTabId}
								onSelectTab={onSelectTab}
								onCloseTab={onCloseTab}
								onDragStart={onDragStart}
								onDragEnd={onDragEnd}
								onReorder={onReorder}
							/>
						))}
						<button
							type="button"
							className="mainTabAdd"
							onClick={onOpenBlankTab}
							title={`Open blank tab (${getShortcutTooltip({ meta: true, key: "t" })})`}
							aria-label="Open blank tab"
						>
							+
						</button>
					</div>
				</div>
				<div className="mainTabsSide mainTabsSideEnd" />
			</div>
			{breadcrumbSegments.length > 0 && (
				<div className={`mainTabsBreadcrumb ${hovered ? "is-visible" : ""}`}>
					{breadcrumbSegments.map((segment, i, arr) => (
						<span
							key={breadcrumbSegments.slice(0, i + 1).join("/")}
							className="mainTabsBreadcrumbItem"
						>
							{i > 0 && (
								<span className="mainTabsBreadcrumbSep" aria-hidden>
									/
								</span>
							)}
							<span
								className={
									i === arr.length - 1
										? "mainTabsBreadcrumbCurrent"
										: "mainTabsBreadcrumbSegment"
								}
							>
								{i === arr.length - 1
									? segment.replace(/\.[^.]+$/, "")
									: segment}
							</span>
						</span>
					))}
				</div>
			)}
		</div>
	);
}

const TabItem = memo(function TabItem({
	tab,
	label,
	isActive,
	dragTabId,
	onSelectTab,
	onCloseTab,
	onDragStart,
	onDragEnd,
	onReorder,
}: {
	tab: WorkspaceTab;
	label: string;
	isActive: boolean;
	dragTabId: string | null;
	onSelectTab: (tabId: string) => void;
	onCloseTab: (tabId: string) => void;
	onDragStart: (tabId: string) => void;
	onDragEnd: () => void;
	onReorder: (fromTabId: string, toTabId: string) => void;
}) {
	const handleSelect = useCallback(
		() => onSelectTab(tab.id),
		[onSelectTab, tab.id],
	);
	const handleDragStart = useCallback(
		() => onDragStart(tab.id),
		[onDragStart, tab.id],
	);
	const handleDragOver = useCallback((event: DragEvent<HTMLButtonElement>) => {
		event.preventDefault();
	}, []);
	const handleDrop = useCallback(
		(event: DragEvent<HTMLButtonElement>) => {
			event.preventDefault();
			if (dragTabId) onReorder(dragTabId, tab.id);
			onDragEnd();
		},
		[dragTabId, onDragEnd, onReorder, tab.id],
	);
	const handleClose = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			event.stopPropagation();
			onCloseTab(tab.id);
		},
		[onCloseTab, tab.id],
	);

	const title =
		tab.kind === "blank"
			? label
			: tab.target && isPathSpecial(tab.target)
				? label
				: (tab.target ?? label);

	return (
		<div className="mainTabWrap">
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
				type="button"
				className={`mainTab ${isActive ? "is-active" : ""}`}
				onClick={handleSelect}
				title={title}
				draggable
				onDragStart={handleDragStart}
				onDragEnd={onDragEnd}
				onDragOver={handleDragOver}
				onDrop={handleDrop}
			>
				<span className="mainTabText">
					<span className="mainTabLabel">{label}</span>
				</span>
			</button>
		</div>
	);
});
