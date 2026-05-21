import { Folder01Icon, Folder03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { toast } from "sonner";
import { useFileTreeContext } from "../../contexts";
import { ALL_DOCS_TAB_ID } from "../../lib/allDocs";
import { CALENDAR_TAB_ID } from "../../lib/calendar";
import { databaseValueToneStyleForColor } from "../../lib/database/palette";
import { DATABASES_TAB_ID } from "../../lib/databases";
import { showNativeContextMenu } from "../../lib/nativeContextMenu";
import { type FileTreeAppearance, type FsEntry, invoke } from "../../lib/tauri";
import { TEMPLATES_TAB_ID } from "../../lib/templatesView";
import { isMarkdownPath, parentDir } from "../../utils/path";
import { ChevronRight } from "../Icons";
import { DatabaseColumnIcon } from "../database/DatabaseColumnIcon";
import { isEditorTextColor } from "../editor/textColors";
import { getFileTypeInfo } from "../filetree/fileTypeUtils";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
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
		path === TEMPLATES_TAB_ID
	);
}

function itemAppearanceStyle(
	path: string,
	appearance?: FileTreeAppearance | null,
): CSSProperties | undefined {
	const color =
		appearance?.color && isEditorTextColor(appearance.color)
			? appearance.color
			: null;
	if (!color) return undefined;
	return {
		...databaseValueToneStyleForColor(path, color),
		"--file-tree-row-icon-color": "var(--database-tone)",
		"--file-tree-row-name-color":
			"color-mix(in srgb, var(--database-tone) 55%, var(--text-primary))",
	} as CSSProperties;
}

function hasCustomColor(path: string, appearance?: FileTreeAppearance | null) {
	return itemAppearanceStyle(path, appearance) ? "true" : "false";
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

function FolderBreadcrumbIcon({
	appearance,
	open,
	size,
	className,
}: {
	appearance?: FileTreeAppearance | null;
	open: boolean;
	size: number;
	className?: string;
}) {
	if (appearance?.icon) {
		return (
			<DatabaseColumnIcon
				iconName={appearance.icon}
				size={size}
				className={className}
			/>
		);
	}
	return (
		<HugeiconsIcon
			icon={open ? Folder03Icon : Folder01Icon}
			size={size}
			strokeWidth={0.9}
			className={className}
			aria-hidden="true"
		/>
	);
}

function FileBreadcrumbIcon({
	path,
	isMarkdown,
	appearance,
	size,
	className,
}: {
	path: string;
	isMarkdown: boolean;
	appearance?: FileTreeAppearance | null;
	size: number;
	className?: string;
}) {
	if (appearance?.icon) {
		return (
			<DatabaseColumnIcon
				iconName={appearance.icon}
				size={size}
				className={className}
			/>
		);
	}
	const { Icon, color } = getFileTypeInfo(path, isMarkdown);
	const iconColor =
		appearance?.color && isEditorTextColor(appearance.color)
			? "var(--file-tree-row-icon-color)"
			: color;
	return (
		<Icon
			size={size}
			className={className}
			style={{ color: iconColor }}
			aria-hidden="true"
		/>
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
	const { itemAppearance } = useFileTreeContext();
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
		<nav className="mainTabsBreadcrumb" aria-label="Current file path">
			{breadcrumbDisplay.map((item, displayIndex) => {
				if (item.type === "overflow") {
					return (
						<span key="breadcrumb-overflow" className="mainTabsBreadcrumbItem">
							{displayIndex > 0 ? (
								<ChevronRight
									size={10}
									className="mainTabsBreadcrumbSep"
									aria-hidden="true"
								/>
							) : null}
							<BreadcrumbOverflowMenu
								hiddenParts={item.hiddenParts}
								itemAppearance={itemAppearance}
								onNavigateDir={onNavigateBreadcrumbPath}
								onOpenFile={onOpenBreadcrumbFile}
							/>
						</span>
					);
				}

				const { part, originalIndex } = item;
				const isCurrent = originalIndex === breadcrumbParts.length - 1;
				const appearance = itemAppearance[part.path];
				const appearanceStyle = itemAppearanceStyle(part.path, appearance);
				const dirPath =
					part.kind === "folder" ? part.path : parentDir(part.path);
				const menuDirPath = breadcrumbParts[originalIndex - 1]?.path ?? "";
				const menuEntries =
					menuDirPath === "" ? rootEntries : childrenByDir[menuDirPath];
				const menuItems = sortBreadcrumbEntries(menuEntries ?? []);
				const key = part.path || ROOT_PATH_KEY;
				const menuKey = `${originalIndex}:${menuDirPath || ROOT_PATH_KEY}`;

				return (
					<span
						key={key}
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
								}}
								onLoadDir={onLoadBreadcrumbDir}
								onNavigateDir={onNavigateBreadcrumbPath}
								onOpenFile={onOpenBreadcrumbFile}
								itemAppearance={itemAppearance}
							/>
						) : null}
						<button
							type="button"
							className="mainTabsBreadcrumbButton"
							aria-current={isCurrent ? "page" : undefined}
							disabled={isCurrent}
							data-has-custom-color={hasCustomColor(part.path, appearance)}
							style={appearanceStyle}
							title={breadcrumbTooltip(part)}
							onClick={() => {
								if (!isCurrent) onNavigateBreadcrumbPath(dirPath);
							}}
							onContextMenu={(event) =>
								handleBreadcrumbContextMenu(event, part)
							}
						>
							{part.kind === "folder" ? (
								<FolderBreadcrumbIcon
									appearance={appearance}
									open
									size={12}
									className="mainTabsBreadcrumbIcon"
								/>
							) : (
								<FileBreadcrumbIcon
									path={part.path}
									isMarkdown={isMarkdownPath(part.path)}
									appearance={appearance}
									size={12}
									className="mainTabsBreadcrumbIcon"
								/>
							)}
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
	itemAppearance,
	onNavigateDir,
	onOpenFile,
}: {
	hiddenParts: BreadcrumbPart[];
	itemAppearance: Record<string, FileTreeAppearance>;
	onNavigateDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => Promise<void>;
}) {
	return (
		<DropdownMenu>
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
					const appearance = itemAppearance[part.path];
					return (
						<DropdownMenuItem
							key={part.path || ROOT_PATH_KEY}
							className="mainTabsBreadcrumbMenuItem"
							data-has-custom-color={hasCustomColor(part.path, appearance)}
							style={itemAppearanceStyle(part.path, appearance)}
							title={breadcrumbTooltip(part)}
							onSelect={() => {
								if (part.kind === "folder") {
									onNavigateDir(part.path);
									return;
								}
								void onOpenFile(part.path);
							}}
						>
							{part.kind === "folder" ? (
								<FolderBreadcrumbIcon
									appearance={appearance}
									open={false}
									size={13}
								/>
							) : (
								<FileBreadcrumbIcon
									path={part.path}
									isMarkdown={isMarkdownPath(part.path)}
									appearance={appearance}
									size={13}
								/>
							)}
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
	itemAppearance,
}: {
	open: boolean;
	dirPath: string;
	entries: FsEntry[];
	loading: boolean;
	onOpenChange: (open: boolean) => void;
	onLoadDir: (dirPath: string) => Promise<void>;
	onNavigateDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => Promise<void>;
	itemAppearance: Record<string, FileTreeAppearance>;
}) {
	const displayEntries = entries.slice(0, 40);
	const hiddenCount = Math.max(0, entries.length - displayEntries.length);

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
						{displayEntries.map((entry) => {
							const appearance = itemAppearance[entry.rel_path];
							return (
								<DropdownMenuItem
									key={entry.rel_path || ROOT_PATH_KEY}
									className="mainTabsBreadcrumbMenuItem"
									data-has-custom-color={hasCustomColor(
										entry.rel_path,
										appearance,
									)}
									style={itemAppearanceStyle(entry.rel_path, appearance)}
									title={entry.rel_path || entry.name}
									onSelect={() => {
										if (entry.kind === "dir") {
											onNavigateDir(entry.rel_path);
											return;
										}
										void onOpenFile(entry.rel_path);
									}}
								>
									{entry.kind === "dir" ? (
										<FolderBreadcrumbIcon
											appearance={appearance}
											open={false}
											size={13}
										/>
									) : (
										<FileBreadcrumbIcon
											path={entry.rel_path}
											isMarkdown={entry.is_markdown}
											appearance={appearance}
											size={13}
										/>
									)}
									<span className="mainTabsBreadcrumbMenuItemLabel">
										{entry.is_markdown
											? entry.name.replace(/\.[^./]+$/, "")
											: entry.name}
									</span>
								</DropdownMenuItem>
							);
						})}
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
