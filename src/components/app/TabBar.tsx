import { memo, useCallback } from "react";
import type { DragEvent, MouseEvent } from "react";
import { TASKS_TAB_ID } from "../../lib/tasks";

interface TabBarProps {
	openTabs: string[];
	activeTabPath: string | null;
	dirtyByPath: Record<string, boolean>;
	dragTabPath: string | null;
	onOpenBlankTab: () => void;
	onSelectTab: (path: string) => void;
	onCloseTab: (path: string) => void;
	onDragStart: (path: string) => void;
	onDragEnd: () => void;
	onReorder: (fromPath: string, toPath: string) => void;
}

export function TabBar({
	openTabs,
	activeTabPath,
	dirtyByPath,
	dragTabPath,
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

	const fileName = useCallback(
		(path: string) => {
			if (path === TASKS_TAB_ID) return "Tasks";
			const parts = path.split("/").filter(Boolean);
			const rawName = parts[parts.length - 1] ?? path;
			return stripFileExtension(rawName);
		},
		[stripFileExtension],
	);

	const breadcrumb = useCallback((path: string) => {
		if (path === TASKS_TAB_ID) return "";
		const parts = path.split("/").filter(Boolean);
		if (parts.length <= 1) return "/";
		return parts.slice(0, -1).join(" / ");
	}, []);

	return (
		<div className="mainTabsBar">
			<div className="mainTabsSide" />
			<div className="mainTabsCenter">
				<div className="mainTabsStrip">
					{openTabs.map((path) => {
						return (
							<TabItem
								key={path}
								path={path}
								fileName={fileName(path)}
								breadcrumb={breadcrumb(path)}
								isActive={path === activeTabPath}
								isDirty={Boolean(dirtyByPath[path])}
								dragTabPath={dragTabPath}
								onSelectTab={onSelectTab}
								onCloseTab={onCloseTab}
								onDragStart={onDragStart}
								onDragEnd={onDragEnd}
								onReorder={onReorder}
							/>
						);
					})}
					<button
						type="button"
						className="mainTabAdd"
						onClick={onOpenBlankTab}
						title="Open blank tab"
						aria-label="Open blank tab"
					>
						+
					</button>
				</div>
			</div>
			<div className="mainTabsSide" />
		</div>
	);
}

const TabItem = memo(function TabItem({
	path,
	fileName,
	breadcrumb,
	isActive,
	isDirty,
	dragTabPath,
	onSelectTab,
	onCloseTab,
	onDragStart,
	onDragEnd,
	onReorder,
}: {
	path: string;
	fileName: string;
	breadcrumb: string;
	isActive: boolean;
	isDirty: boolean;
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
				className={`mainTab ${isActive ? "is-active" : ""}`}
				onClick={handleSelect}
				title={path === TASKS_TAB_ID ? fileName : path}
				draggable
				onDragStart={handleDragStart}
				onDragEnd={onDragEnd}
				onDragOver={handleDragOver}
				onDrop={handleDrop}
			>
				{isDirty ? <span className="mainTabDirty" aria-hidden /> : null}
				<span
					className={["mainTabText", !breadcrumb ? "is-single" : ""]
						.filter(Boolean)
						.join(" ")}
				>
					<span className="mainTabLabel">{fileName}</span>
					{breadcrumb ? (
						<span className="mainTabBreadcrumb">{breadcrumb}</span>
					) : null}
				</span>
			</button>
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
		</div>
	);
});
