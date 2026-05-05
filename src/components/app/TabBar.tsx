import { PointerActivationConstraints } from "@dnd-kit/dom";
import {
	DragDropProvider,
	type DragEndEvent,
	PointerSensor,
} from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { memo, useCallback, useRef, useState } from "react";
import type { MouseEvent, MutableRefObject } from "react";
import { useShortcutBindings } from "../../hooks/useShortcutBindings";
import { AI_AGENT_TAB_ID } from "../../lib/aiAgent";
import { ALL_DOCS_TAB_ID } from "../../lib/allDocs";
import { CALENDAR_TAB_ID } from "../../lib/calendar";
import { DATABASES_TAB_ID } from "../../lib/databases";
import { formatShortcutForPlatform } from "../../lib/shortcuts/platform";
import type { FsEntry } from "../../lib/tauri";
import { TEMPLATES_TAB_ID } from "../../lib/templatesView";
import { ChevronRight, File, FileText, FolderOpen } from "../Icons";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";
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
	onSelectTab: (tabId: string) => void;
	onCloseTab: (tabId: string) => void;
	onStartRenamePath: (path: string) => void;
	onReorder: (fromTabId: string, toTabId: string) => void;
}

const MAIN_TAB_DND_TYPE = "main-tab";
const MAIN_TAB_DND_GROUP = "main-tabs";
const ROOT_PATH_KEY = "__root__";
const MAIN_TAB_SENSORS = [
	PointerSensor.configure({
		activationConstraints: [
			new PointerActivationConstraints.Distance({ value: 5 }),
		],
	}),
];

interface BreadcrumbPart {
	label: string;
	path: string;
	kind: "folder" | "file";
}

function sortBreadcrumbEntries(entries: FsEntry[]) {
	return [...entries].sort((a, b) => {
		if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
		return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
	});
}

function menuTitleForDir(path: string) {
	if (!path) return "Space";
	const parts = path.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? "Space";
}

function isPathSpecial(path: string): boolean {
	return (
		path === AI_AGENT_TAB_ID ||
		path === ALL_DOCS_TAB_ID ||
		path === CALENDAR_TAB_ID ||
		path === DATABASES_TAB_ID ||
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
			if (tab.target === AI_AGENT_TAB_ID) return "AI Agent";
			if (tab.target === ALL_DOCS_TAB_ID) return "All Notes";
			if (tab.target === CALENDAR_TAB_ID) return "Calendar";
			if (tab.target === DATABASES_TAB_ID) return "Collections";
			if (tab.target === TEMPLATES_TAB_ID) return "Templates";
			const parts = (tab.target ?? "").split("/").filter(Boolean);
			const rawName = parts[parts.length - 1] ?? tab.target ?? "Untitled";
			return compactLabel(stripFileExtension(rawName));
		},
		[compactLabel, stripFileExtension],
	);

	const showTabs = tabs.length > 1;
	const newTabShortcut = getBinding("new-tab");
	const [openBreadcrumbMenuKey, setOpenBreadcrumbMenuKey] = useState<
		string | null
	>(null);
	const breadcrumbParts: BreadcrumbPart[] =
		activeTabPath && !isPathSpecial(activeTabPath)
			? [
					{ label: "Space", path: "", kind: "folder" },
					...activeTabPath
						.split("/")
						.filter(Boolean)
						.map((segment, index, segments): BreadcrumbPart => {
							const isFile = index === segments.length - 1;
							return {
								label: isFile ? stripFileExtension(segment) : segment,
								path: segments.slice(0, index + 1).join("/"),
								kind: isFile ? "file" : "folder",
							};
						}),
				]
			: [];
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
		<div className="mainTabsBarWrap">
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
			{breadcrumbParts.length > 0 && (
				<nav className="mainTabsBreadcrumb" aria-label="Current file path">
					{breadcrumbParts.map((part, index) => {
						const isCurrent = index === breadcrumbParts.length - 1;
						const dirPath =
							part.kind === "folder"
								? part.path
								: part.path.split("/").slice(0, -1).join("/");
						const menuDirPath = breadcrumbParts[index - 1]?.path ?? "";
						const menuEntries =
							menuDirPath === "" ? rootEntries : childrenByDir[menuDirPath];
						const menuItems = sortBreadcrumbEntries(menuEntries ?? []);
						const key = part.path || ROOT_PATH_KEY;
						const menuKey = `${index}:${menuDirPath || ROOT_PATH_KEY}`;

						return (
							<span
								key={key}
								className="mainTabsBreadcrumbItem"
								data-current={isCurrent ? "true" : undefined}
							>
								{index > 0 ? (
									<BreadcrumbEntryMenu
										open={openBreadcrumbMenuKey === menuKey}
										dirPath={menuDirPath}
										entries={menuItems}
										loading={menuEntries === undefined}
										onOpenChange={(open) => {
											setOpenBreadcrumbMenuKey(open ? menuKey : null);
										}}
										onLoadDir={onLoadBreadcrumbDir}
										onNavigateDir={onNavigateBreadcrumbPath}
										onOpenFile={onOpenBreadcrumbFile}
									/>
								) : null}
								<button
									type="button"
									className="mainTabsBreadcrumbButton"
									aria-current={isCurrent ? "page" : undefined}
									disabled={isCurrent}
									title={
										isCurrent
											? (activeTabPath ?? undefined)
											: `Show ${dirPath || "root"}`
									}
									onClick={() => onNavigateBreadcrumbPath(dirPath)}
								>
									{part.kind === "folder" ? (
										<FolderOpen
											size={12}
											className="mainTabsBreadcrumbIcon"
											aria-hidden="true"
										/>
									) : (
										<FileText
											size={12}
											className="mainTabsBreadcrumbIcon"
											aria-hidden="true"
										/>
									)}
									<span className="mainTabsBreadcrumbLabel">{part.label}</span>
								</button>
							</span>
						);
					})}
				</nav>
			)}
		</div>
	);
}

function BreadcrumbEntryMenu({
	open,
	dirPath,
	entries,
	loading,
	onOpenChange,
	onLoadDir,
	onNavigateDir,
	onOpenFile,
}: {
	open: boolean;
	dirPath: string;
	entries: FsEntry[];
	loading: boolean;
	onOpenChange: (open: boolean) => void;
	onLoadDir: (dirPath: string) => Promise<void>;
	onNavigateDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => Promise<void>;
}) {
	const displayEntries = entries.slice(0, 40);
	const hiddenCount = Math.max(0, entries.length - displayEntries.length);

	return (
		<DropdownMenu
			open={open}
			onOpenChange={(nextOpen) => {
				if (nextOpen) void onLoadDir(dirPath);
				onOpenChange(nextOpen);
			}}
		>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="mainTabsBreadcrumbSepButton"
					aria-label={`Browse ${menuTitleForDir(dirPath)}`}
				>
					<ChevronRight
						size={10}
						className="mainTabsBreadcrumbSep"
						aria-hidden="true"
					/>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				side="bottom"
				className="mainTabsBreadcrumbMenu"
			>
				<DropdownMenuLabel className="mainTabsBreadcrumbMenuLabel">
					{menuTitleForDir(dirPath)}
				</DropdownMenuLabel>
				<DropdownMenuSeparator className="mainTabsBreadcrumbMenuSeparator" />
				{loading ? (
					<div className="mainTabsBreadcrumbMenuState">Loading...</div>
				) : displayEntries.length ? (
					<>
						{displayEntries.map((entry) => (
							<DropdownMenuItem
								key={entry.rel_path || ROOT_PATH_KEY}
								className="mainTabsBreadcrumbMenuItem"
								onSelect={() => {
									if (entry.kind === "dir") {
										onNavigateDir(entry.rel_path);
										return;
									}
									void onOpenFile(entry.rel_path);
								}}
							>
								{entry.kind === "dir" ? (
									<FolderOpen size={13} aria-hidden="true" />
								) : entry.is_markdown ? (
									<FileText size={13} aria-hidden="true" />
								) : (
									<File size={13} aria-hidden="true" />
								)}
								<span className="mainTabsBreadcrumbMenuItemLabel">
									{entry.is_markdown
										? entry.name.replace(/\.[^./]+$/, "")
										: entry.name}
								</span>
							</DropdownMenuItem>
						))}
						{hiddenCount > 0 ? (
							<div className="mainTabsBreadcrumbMenuState">
								+{hiddenCount} more
							</div>
						) : null}
					</>
				) : (
					<div className="mainTabsBreadcrumbMenuState">Empty folder</div>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
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
