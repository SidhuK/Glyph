import { useCallback, useState } from "react";
import type { MouseEvent } from "react";
import { toast } from "sonner";
import { ALL_DOCS_TAB_ID } from "../../lib/allDocs";
import { CALENDAR_TAB_ID } from "../../lib/calendar";
import { DATABASES_TAB_ID } from "../../lib/databases";
import { showNativeContextMenu } from "../../lib/nativeContextMenu";
import { SPACE_CONNECTIONS_TAB_ID } from "../../lib/spaceConnections";
import { type FsEntry, invoke } from "../../lib/tauri";
import { parentDir } from "../../utils/path";
import { ChevronRight } from "../Icons";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";

interface MainTabsBreadcrumbsProps {
	activeTabPath: string | null;
	rootEntries: FsEntry[];
	childrenByDir: Record<string, FsEntry[] | undefined>;
	onNavigateBreadcrumbPath: (dirPath: string) => void;
	onLoadBreadcrumbDir: (dirPath: string) => Promise<void>;
	onOpenBreadcrumbFile: (relPath: string) => Promise<void>;
}

interface BreadcrumbPart {
	label: string;
	path: string;
	kind: "folder" | "file";
}

type BreadcrumbDisplayItem =
	| {
			type: "part";
			part: BreadcrumbPart;
			originalIndex: number;
	  }
	| {
			type: "overflow";
			hiddenParts: BreadcrumbPart[];
	  };

const ROOT_PATH_KEY = "__root__";

function stripFileExtension(name: string) {
	if (!name || name.startsWith(".")) return name;
	const withoutExt = name.replace(/\.[^./]+$/, "");
	return withoutExt || name;
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
		path === ALL_DOCS_TAB_ID ||
		path === CALENDAR_TAB_ID ||
		path === DATABASES_TAB_ID ||
		path === SPACE_CONNECTIONS_TAB_ID
	);
}

function breadcrumbDisplayItems(
	parts: BreadcrumbPart[],
): BreadcrumbDisplayItem[] {
	if (parts.length <= 4) {
		return parts.map((part, originalIndex) => ({
			type: "part",
			part,
			originalIndex,
		}));
	}

	const hiddenParts = parts.slice(1, -2);
	return [
		{ type: "part", part: parts[0], originalIndex: 0 },
		{ type: "overflow", hiddenParts },
		...parts.slice(-2).map((part, offset) => ({
			type: "part" as const,
			part,
			originalIndex: parts.length - 2 + offset,
		})),
	];
}

function breadcrumbTooltip(part: BreadcrumbPart) {
	if (!part.path) return "Space";
	return part.path;
}

function breadcrumbPartsForPath(path: string | null): BreadcrumbPart[] {
	if (!path || isPathSpecial(path)) return [];
	return [
		{ label: "Space", path: "", kind: "folder" },
		...path
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
	];
}

function entryLabel(entry: FsEntry) {
	return entry.is_markdown ? entry.name.replace(/\.[^./]+$/, "") : entry.name;
}

function BreadcrumbMenuItem({
	entry,
	childrenByDir,
	onLoadDir,
	onNavigateDir,
	onOpenFile,
}: {
	entry: FsEntry;
	childrenByDir: Record<string, FsEntry[] | undefined>;
	onLoadDir: (dirPath: string) => Promise<void>;
	onNavigateDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => Promise<void>;
}) {
	const childEntries = childrenByDir[entry.rel_path];
	const loading = childEntries === undefined;
	const isDir = entry.kind === "dir";

	if (!isDir) {
		return (
			<DropdownMenuItem
				key={entry.rel_path || ROOT_PATH_KEY}
				className="mainTabsBreadcrumbMenuItem"
				title={entry.rel_path || entry.name}
				onSelect={() => void onOpenFile(entry.rel_path)}
			>
				<span className="mainTabsBreadcrumbMenuItemLabel">
					{entryLabel(entry)}
				</span>
			</DropdownMenuItem>
		);
	}

	return (
		<DropdownMenuSub
			onOpenChange={(open) => {
				if (open && loading) void onLoadDir(entry.rel_path);
			}}
		>
			<DropdownMenuSubTrigger className="mainTabsBreadcrumbMenuItem">
				<span className="mainTabsBreadcrumbMenuItemLabel">{entry.name}</span>
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="mainTabsBreadcrumbMenu" sideOffset={4}>
				{loading ? null : childEntries.length === 0 ? (
					<div className="mainTabsBreadcrumbMenuState">Empty folder</div>
				) : (
					<>
						{childEntries.slice(0, 40).map((child) => (
							<BreadcrumbMenuItem
								key={child.rel_path || ROOT_PATH_KEY}
								entry={child}
								childrenByDir={childrenByDir}
								onLoadDir={onLoadDir}
								onNavigateDir={onNavigateDir}
								onOpenFile={onOpenFile}
							/>
						))}
						{childEntries.length > 40 ? (
							<div className="mainTabsBreadcrumbMenuState">
								+{childEntries.length - 40} more
							</div>
						) : null}
					</>
				)}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

export function MainTabsBreadcrumbs({
	activeTabPath,
	rootEntries,
	childrenByDir,
	onNavigateBreadcrumbPath,
	onLoadBreadcrumbDir,
	onOpenBreadcrumbFile,
}: MainTabsBreadcrumbsProps) {
	const [menuOpen, setMenuOpen] = useState(false);
	const [openBreadcrumbMenuKey, setOpenBreadcrumbMenuKey] = useState<
		string | null
	>(null);
	const breadcrumbParts = breadcrumbPartsForPath(activeTabPath);
	const breadcrumbDisplay = breadcrumbDisplayItems(breadcrumbParts);
	const handleCopyBreadcrumbPath = useCallback(async (part: BreadcrumbPart) => {
		try {
			const clipboard = navigator.clipboard;
			if (!clipboard?.writeText) {
				throw new Error("Clipboard is not available.");
			}
			await clipboard.writeText(part.path || "/");
			toast.success("Copied path.");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Could not copy path.";
			toast.error("Could not copy path", { description: message });
		}
	}, []);
	const handleRevealBreadcrumbPart = useCallback(
		async (part: BreadcrumbPart) => {
			if (part.kind === "folder") {
				onNavigateBreadcrumbPath(part.path);
				return;
			}
			onNavigateBreadcrumbPath(parentDir(part.path));
			await onOpenBreadcrumbFile(part.path);
		},
		[onNavigateBreadcrumbPath, onOpenBreadcrumbFile],
	);
	const handleOpenBreadcrumbContainer = useCallback(
		(part: BreadcrumbPart) => {
			onNavigateBreadcrumbPath(
				part.kind === "folder" ? part.path : parentDir(part.path),
			);
		},
		[onNavigateBreadcrumbPath],
	);
	const handleRevealInFinder = useCallback(async (part: BreadcrumbPart) => {
		if (part.kind !== "file") return;
		try {
			await invoke("space_reveal_path", { path: part.path });
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Could not show file in Finder.";
			toast.error("Could not show file in Finder", { description: message });
		}
	}, []);
	const handleBreadcrumbContextMenu = useCallback(
		(event: MouseEvent<HTMLButtonElement>, part: BreadcrumbPart) => {
			void showNativeContextMenu(event, [
				{
					label: "Copy Path",
					action: () => void handleCopyBreadcrumbPath(part),
				},
				{
					label: "Reveal in File Tree",
					action: () => void handleRevealBreadcrumbPart(part),
				},
				{
					label:
						part.kind === "folder" ? "Open Folder" : "Open Containing Folder",
					action: () => handleOpenBreadcrumbContainer(part),
				},
				...(part.kind === "file"
					? [
							{ type: "separator" as const },
							{
								label: "Show in Finder",
								action: () => void handleRevealInFinder(part),
							},
						]
					: []),
			]).catch((error: unknown) => {
				console.error("Failed to show breadcrumb context menu", error);
			});
		},
		[
			handleCopyBreadcrumbPath,
			handleOpenBreadcrumbContainer,
			handleRevealBreadcrumbPart,
			handleRevealInFinder,
		],
	);

	if (breadcrumbParts.length === 0) return null;

	return (
		<nav
			className="mainTabsBreadcrumb"
			data-open={menuOpen ? "true" : undefined}
			aria-label="Current file path"
		>
			{breadcrumbDisplay.map((item, displayIndex) => {
				if (item.type === "overflow") {
					return (
						<span key="breadcrumb-overflow" className="mainTabsBreadcrumbItem">
							{displayIndex > 0 ? (
								<ChevronRight
									size="var(--icon-xs)"
									className="mainTabsBreadcrumbSep"
									aria-hidden="true"
								/>
							) : null}
							<BreadcrumbOverflowMenu
								hiddenParts={item.hiddenParts}
								onNavigateDir={onNavigateBreadcrumbPath}
								onOpenFile={onOpenBreadcrumbFile}
								onMenuOpenChange={setMenuOpen}
							/>
						</span>
					);
				}

				const { part, originalIndex } = item;
				const isCurrent = originalIndex === breadcrumbParts.length - 1;
				const menuDirPath = breadcrumbParts[originalIndex - 1]?.path ?? "";
				const menuEntries =
					menuDirPath === "" ? rootEntries : childrenByDir[menuDirPath];
				const menuItems = sortBreadcrumbEntries(menuEntries ?? []);
				const menuKey = `${originalIndex}:${menuDirPath || ROOT_PATH_KEY}`;

				return (
					<span
						key={part.path || ROOT_PATH_KEY}
						className="mainTabsBreadcrumbItem"
						data-current={isCurrent ? "true" : undefined}
					>
						{displayIndex > 0 ? (
							<BreadcrumbEntryMenu
								open={openBreadcrumbMenuKey === menuKey}
								dirPath={menuDirPath}
								entries={menuItems}
								loading={menuEntries === undefined}
								onOpenChange={(open) => {
									setOpenBreadcrumbMenuKey(open ? menuKey : null);
									setMenuOpen(open);
								}}
								onLoadDir={onLoadBreadcrumbDir}
								onNavigateDir={onNavigateBreadcrumbPath}
								onOpenFile={onOpenBreadcrumbFile}
								childrenByDir={childrenByDir}
							/>
						) : null}
						<button
							type="button"
							className="mainTabsBreadcrumbButton"
							aria-current={isCurrent ? "page" : undefined}
							aria-disabled={isCurrent}
							title={breadcrumbTooltip(part)}
							onClick={() => {
								if (!isCurrent && part.kind === "file") {
									void onOpenBreadcrumbFile(part.path);
								}
							}}
							onContextMenu={(event) =>
								handleBreadcrumbContextMenu(event, part)
							}
						>
							<span className="mainTabsBreadcrumbLabel">{part.label}</span>
						</button>
					</span>
				);
			})}
		</nav>
	);
}

function BreadcrumbOverflowMenu({
	hiddenParts,
	onNavigateDir,
	onOpenFile,
	onMenuOpenChange,
}: {
	hiddenParts: BreadcrumbPart[];
	onNavigateDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => Promise<void>;
	onMenuOpenChange: (open: boolean) => void;
}) {
	return (
		<DropdownMenu
			onOpenChange={(nextOpen) => {
				onMenuOpenChange(nextOpen);
			}}
		>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="mainTabsBreadcrumbOverflowButton"
					title={`${hiddenParts.length} hidden path ${
						hiddenParts.length === 1 ? "item" : "items"
					}`}
					aria-label="Show hidden path items"
				>
					...
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				side="bottom"
				className="mainTabsBreadcrumbMenu"
			>
				{hiddenParts.map((part) => {
					return (
						<DropdownMenuItem
							key={part.path || ROOT_PATH_KEY}
							className="mainTabsBreadcrumbMenuItem"
							title={breadcrumbTooltip(part)}
							onSelect={() => {
								if (part.kind === "folder") {
									onNavigateDir(part.path);
									return;
								}
								void onOpenFile(part.path);
							}}
						>
							<span className="mainTabsBreadcrumbMenuItemLabel">
								{part.label}
							</span>
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
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
	childrenByDir,
}: {
	open: boolean;
	dirPath: string;
	entries: FsEntry[];
	loading: boolean;
	onOpenChange: (open: boolean) => void;
	onLoadDir: (dirPath: string) => Promise<void>;
	onNavigateDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => Promise<void>;
	childrenByDir: Record<string, FsEntry[] | undefined>;
}) {
	return (
		<DropdownMenu
			open={open}
			onOpenChange={(nextOpen) => {
				if (nextOpen && loading) void onLoadDir(dirPath);
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
						size="var(--icon-xs)"
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
				{loading ? null : entries.length === 0 ? (
					<div className="mainTabsBreadcrumbMenuState">Empty folder</div>
				) : (
					<>
						{entries.map((entry) => (
							<BreadcrumbMenuItem
								key={entry.rel_path || ROOT_PATH_KEY}
								entry={entry}
								childrenByDir={childrenByDir}
								onLoadDir={onLoadDir}
								onNavigateDir={onNavigateDir}
								onOpenFile={onOpenFile}
							/>
						))}
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
