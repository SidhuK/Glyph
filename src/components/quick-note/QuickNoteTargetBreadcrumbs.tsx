import { useCallback, useEffect, useRef, useState } from "react";
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

export const QUICK_NOTE_TARGET_VALUE = "__quick-note-today__";

export interface QuickNoteTarget {
	value: string;
	path: string;
	label: string;
	detail: string;
}

interface BreadcrumbPart {
	label: string;
	path: string;
	kind: "folder" | "file";
}

interface QuickNoteTargetBreadcrumbsProps {
	selectedTarget: QuickNoteTarget;
	quickNotesFolder: string;
	todayQuickNotePath: string;
	onSelectTarget: (target: QuickNoteTarget) => void;
}

const ROOT_PATH_KEY = "__root__";

function stripFileExtension(name: string) {
	if (!name || name.startsWith(".")) return name;
	const withoutExt = name.replace(/\.[^./]+$/, "");
	return withoutExt || name;
}

function savedLabel(path: string) {
	const name = path.split("/").filter(Boolean).pop() ?? path;
	return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

function targetDetail(path: string) {
	return parentDir(path) || "Space root";
}

function sortTargetEntries(entries: FsEntry[]) {
	return [...entries]
		.filter((entry) => entry.kind === "dir" || entry.is_markdown)
		.sort((a, b) => {
			if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
			return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
		});
}

function menuTitleForDir(path: string) {
	if (!path) return "Space";
	const parts = path.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? "Space";
}

function breadcrumbPartsForTarget(
	path: string,
	targetValue: string,
	todayQuickNotePath: string,
): BreadcrumbPart[] {
	return [
		{ label: "Space", path: "", kind: "folder" },
		...path
			.split("/")
			.filter(Boolean)
			.map((segment, index, segments): BreadcrumbPart => {
				const segmentPath = segments.slice(0, index + 1).join("/");
				const isFile = index === segments.length - 1;
				let label = isFile ? stripFileExtension(segment) : segment;
				if (
					isFile &&
					targetValue === QUICK_NOTE_TARGET_VALUE &&
					path === todayQuickNotePath
				) {
					label = "Today's quick note";
				}
				return {
					label,
					path: segmentPath,
					kind: isFile ? "file" : "folder",
				};
			}),
	];
}

function fileTarget(path: string): QuickNoteTarget {
	return {
		value: path,
		path,
		label: savedLabel(path),
		detail: targetDetail(path),
	};
}

function todayQuickNoteTarget(todayQuickNotePath: string): QuickNoteTarget {
	return {
		value: QUICK_NOTE_TARGET_VALUE,
		path: todayQuickNotePath,
		label: "Today's quick note",
		detail: targetDetail(todayQuickNotePath),
	};
}

function entryLabel(entry: FsEntry) {
	return entry.is_markdown ? entry.name.replace(/\.[^./]+$/, "") : entry.name;
}

function TargetBreadcrumbMenuItem({
	entry,
	childrenByDir,
	onLoadDir,
	onSelectTarget,
}: {
	entry: FsEntry;
	childrenByDir: Record<string, FsEntry[] | undefined>;
	onLoadDir: (dirPath: string) => Promise<void>;
	onSelectTarget: (target: QuickNoteTarget) => void;
}) {
	const childEntries = childrenByDir[entry.rel_path];
	const loading = childEntries === undefined;
	const isDir = entry.kind === "dir";

	if (!isDir) {
		return (
			<DropdownMenuItem
				key={entry.rel_path || ROOT_PATH_KEY}
				className="quickNoteTargetMenuItem"
				title={entry.rel_path || entry.name}
				onSelect={() => onSelectTarget(fileTarget(entry.rel_path))}
			>
				<span className="quickNoteTargetMenuItemLabel">
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
			<DropdownMenuSubTrigger className="quickNoteTargetMenuItem">
				<span className="quickNoteTargetMenuItemLabel">{entry.name}</span>
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="quickNoteTargetMenu" sideOffset={4}>
				{loading ? null : childEntries.length === 0 ? (
					<div className="quickNoteTargetMenuState">Empty folder</div>
				) : (
					<>
						{childEntries.slice(0, 40).map((child) => (
							<TargetBreadcrumbMenuItem
								key={child.rel_path || ROOT_PATH_KEY}
								entry={child}
								childrenByDir={childrenByDir}
								onLoadDir={onLoadDir}
								onSelectTarget={onSelectTarget}
							/>
						))}
						{childEntries.length > 40 ? (
							<div className="quickNoteTargetMenuState">
								+{childEntries.length - 40} more
							</div>
						) : null}
					</>
				)}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

function TargetBreadcrumbEntryMenu({
	open,
	dirPath,
	entries,
	loading,
	quickNotesFolder,
	todayQuickNotePath,
	selectedTargetValue,
	onOpenChange,
	onLoadDir,
	onSelectTarget,
	childrenByDir,
}: {
	open: boolean;
	dirPath: string;
	entries: FsEntry[];
	loading: boolean;
	quickNotesFolder: string;
	todayQuickNotePath: string;
	selectedTargetValue: string;
	onOpenChange: (open: boolean) => void;
	onLoadDir: (dirPath: string) => Promise<void>;
	onSelectTarget: (target: QuickNoteTarget) => void;
	childrenByDir: Record<string, FsEntry[] | undefined>;
}) {
	const showTodayQuickNote = dirPath === quickNotesFolder;

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
					className="quickNoteTargetSepButton"
					aria-label={`Browse ${menuTitleForDir(dirPath)}`}
				>
					<ChevronRight
						size="var(--icon-xs)"
						className="quickNoteTargetSep"
						aria-hidden="true"
					/>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				side="top"
				className="quickNoteTargetMenu"
			>
				<DropdownMenuLabel className="quickNoteTargetMenuLabel">
					{menuTitleForDir(dirPath)}
				</DropdownMenuLabel>
				{showTodayQuickNote ? (
					<DropdownMenuItem
						className="quickNoteTargetMenuItem"
						title={todayQuickNotePath}
						data-selected={
							selectedTargetValue === QUICK_NOTE_TARGET_VALUE
								? "true"
								: undefined
						}
						onSelect={() =>
							onSelectTarget(todayQuickNoteTarget(todayQuickNotePath))
						}
					>
						<span className="quickNoteTargetMenuItemLabel">
							Today&apos;s quick note
						</span>
					</DropdownMenuItem>
				) : null}
				{loading ? null : entries.length === 0 ? (
					<div className="quickNoteTargetMenuState">Empty folder</div>
				) : (
					entries.map((entry) => (
						<TargetBreadcrumbMenuItem
							key={entry.rel_path || ROOT_PATH_KEY}
							entry={entry}
							childrenByDir={childrenByDir}
							onLoadDir={onLoadDir}
							onSelectTarget={onSelectTarget}
						/>
					))
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function QuickNoteTargetBreadcrumbs({
	selectedTarget,
	quickNotesFolder,
	todayQuickNotePath,
	onSelectTarget,
}: QuickNoteTargetBreadcrumbsProps) {
	const [childrenByDir, setChildrenByDir] = useState<
		Record<string, FsEntry[] | undefined>
	>({});
	const childrenByDirRef = useRef(childrenByDir);
	childrenByDirRef.current = childrenByDir;
	const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
	const breadcrumbParts = breadcrumbPartsForTarget(
		selectedTarget.path,
		selectedTarget.value,
		todayQuickNotePath,
	);

	const loadDir = useCallback(async (dirPath: string) => {
		if (childrenByDirRef.current[dirPath] !== undefined) return;
		try {
			const entries = await invoke(
				"space_list_dir",
				dirPath ? { dir: dirPath } : {},
			);
			setChildrenByDir((current) => ({
				...current,
				[dirPath]: sortTargetEntries(entries),
			}));
		} catch {
			setChildrenByDir((current) => ({
				...current,
				[dirPath]: [],
			}));
		}
	}, []);

	useEffect(() => {
		const segments = selectedTarget.path.split("/").filter(Boolean);
		const dirsToLoad = [
			"",
			...segments
				.slice(0, -1)
				.map((_, index) => segments.slice(0, index + 1).join("/")),
		];
		for (const dirPath of dirsToLoad) {
			void loadDir(dirPath);
		}
	}, [selectedTarget.path, loadDir]);

	const handleSelectTarget = useCallback(
		(target: QuickNoteTarget) => {
			onSelectTarget(target);
			setOpenMenuKey(null);
		},
		[onSelectTarget],
	);

	return (
		<nav
			className="quickNoteTargetBreadcrumb"
			data-open="true"
			aria-label="Quick note destination"
		>
			{breadcrumbParts.map((part, index) => {
				const isCurrent = index === breadcrumbParts.length - 1;
				const menuDirPath = breadcrumbParts[index - 1]?.path ?? "";
				const menuEntries = childrenByDir[menuDirPath];
				const menuItems = menuEntries ?? [];
				const menuKey = `${index}:${menuDirPath || ROOT_PATH_KEY}`;

				return (
					<span
						key={part.path || ROOT_PATH_KEY}
						className="quickNoteTargetItem"
						data-current={isCurrent ? "true" : undefined}
					>
						{index > 0 ? (
							<TargetBreadcrumbEntryMenu
								open={openMenuKey === menuKey}
								dirPath={menuDirPath}
								entries={menuItems}
								loading={menuEntries === undefined}
								quickNotesFolder={quickNotesFolder}
								todayQuickNotePath={todayQuickNotePath}
								selectedTargetValue={selectedTarget.value}
								onOpenChange={(open) => {
									setOpenMenuKey(open ? menuKey : null);
								}}
								onLoadDir={loadDir}
								onSelectTarget={handleSelectTarget}
								childrenByDir={childrenByDir}
							/>
						) : null}
						<button
							type="button"
							className="quickNoteTargetButton"
							aria-current={isCurrent ? "page" : undefined}
							aria-disabled={isCurrent}
							title={part.path || "Space"}
						>
							<span className="quickNoteTargetLabel">{part.label}</span>
						</button>
					</span>
				);
			})}
		</nav>
	);
}
