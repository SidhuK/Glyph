import { AiNetworkIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useCallback, useState } from "react";
import type { DragEvent, MouseEvent } from "react";
import { ALL_DOCS_TAB_ID } from "../../lib/allDocs";
import { CALENDAR_TAB_ID } from "../../lib/calendar";
import { DATABASES_TAB_ID } from "../../lib/databases";
import { getShortcutTooltip } from "../../lib/shortcuts";

interface TabBarProps {
	openTabs: string[];
	activeTabPath: string | null;
	dragTabPath: string | null;
	useWindowBackground?: boolean;
	showAiToggle?: boolean;
	aiPanelOpen?: boolean;
	onOpenBlankTab: () => void;
	onToggleAiPanel?: () => void;
	onSelectTab: (path: string) => void;
	onCloseTab: (path: string) => void;
	onDragStart: (path: string) => void;
	onDragEnd: () => void;
	onReorder: (fromPath: string, toPath: string) => void;
}

export function TabBar({
	openTabs,
	activeTabPath,
	dragTabPath,
	useWindowBackground = false,
	showAiToggle = false,
	aiPanelOpen = false,
	onOpenBlankTab,
	onToggleAiPanel,
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

	const fileName = useCallback(
		(path: string) => {
			if (path === ALL_DOCS_TAB_ID) return "All Docs";
			if (path === CALENDAR_TAB_ID) return "Calendar";
			if (path === DATABASES_TAB_ID) return "Collections";
			const parts = path.split("/").filter(Boolean);
			const rawName = parts[parts.length - 1] ?? path;
			return stripFileExtension(rawName);
		},
		[stripFileExtension],
	);

	const [hovered, setHovered] = useState(false);

	const breadcrumbSegments =
		activeTabPath &&
		activeTabPath !== ALL_DOCS_TAB_ID &&
		activeTabPath !== CALENDAR_TAB_ID &&
		activeTabPath !== DATABASES_TAB_ID
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
						{openTabs.map((path) => {
							return (
								<TabItem
									key={path}
									path={path}
									fileName={fileName(path)}
									isActive={path === activeTabPath}
									dragTabPath={dragTabPath}
									onSelectTab={onSelectTab}
									onCloseTab={onCloseTab}
									onDragStart={onDragStart}
									onDragEnd={onDragEnd}
									onReorder={onReorder}
								/>
							);
						})}
						{openTabs.length > 0 ? (
							<button
								type="button"
								className="mainTabAdd"
								onClick={onOpenBlankTab}
								title={`Open blank tab (${getShortcutTooltip({ meta: true, key: "t" })})`}
								aria-label="Open blank tab"
							>
								+
							</button>
						) : null}
					</div>
				</div>
				<div className="mainTabsSide mainTabsSideEnd">
					{showAiToggle && onToggleAiPanel ? (
						<button
							type="button"
							className={`mainTabsAiToggle ${aiPanelOpen ? "is-active" : ""}`}
							onClick={onToggleAiPanel}
							aria-label={aiPanelOpen ? "Close AI panel" : "Open AI panel"}
							title={`${aiPanelOpen ? "Close" : "Open"} AI panel (${getShortcutTooltip({ meta: true, shift: true, key: "a" })})`}
						>
							<HugeiconsIcon icon={AiNetworkIcon} size={16} />
						</button>
					) : null}
				</div>
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
	path,
	fileName,
	isActive,
	dragTabPath,
	onSelectTab,
	onCloseTab,
	onDragStart,
	onDragEnd,
	onReorder,
}: {
	path: string;
	fileName: string;
	isActive: boolean;
	dragTabPath: string | null;
	onSelectTab: (path: string) => void;
	onCloseTab: (path: string) => void;
	onDragStart: (path: string) => void;
	onDragEnd: () => void;
	onReorder: (fromPath: string, toPath: string) => void;
}) {
	const handleSelect = useCallback(
		() => onSelectTab(path),
		[onSelectTab, path],
	);
	const handleDragStart = useCallback(
		() => onDragStart(path),
		[onDragStart, path],
	);
	const handleDragOver = useCallback((event: DragEvent<HTMLButtonElement>) => {
		event.preventDefault();
	}, []);
	const handleDrop = useCallback(
		(event: DragEvent<HTMLButtonElement>) => {
			event.preventDefault();
			if (dragTabPath) onReorder(dragTabPath, path);
			onDragEnd();
		},
		[dragTabPath, onDragEnd, onReorder, path],
	);
	const handleClose = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			event.stopPropagation();
			onCloseTab(path);
		},
		[onCloseTab, path],
	);

	return (
		<div className="mainTabWrap">
			<button
				type="button"
				className="mainTabClose"
				onClick={handleClose}
				aria-label={`Close ${fileName}`}
			>
				<span className="mainTabCloseGlyph" aria-hidden>
					×
				</span>
			</button>
			<button
				type="button"
				className={`mainTab ${isActive ? "is-active" : ""}`}
				onClick={handleSelect}
				title={
					path === ALL_DOCS_TAB_ID ||
					path === CALENDAR_TAB_ID ||
					path === DATABASES_TAB_ID
						? fileName
						: path
				}
				draggable
				onDragStart={handleDragStart}
				onDragEnd={onDragEnd}
				onDragOver={handleDragOver}
				onDrop={handleDrop}
			>
				<span className="mainTabText">
					<span className="mainTabLabel">{fileName}</span>
				</span>
			</button>
		</div>
	);
});
