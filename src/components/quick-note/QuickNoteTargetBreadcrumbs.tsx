import { StickyNote03Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type FsEntry, invoke } from "../../lib/tauri";
import { displayNameFromPath } from "../../utils/path";
import { DirectoryBreadcrumbMenuItem } from "../DirectoryBreadcrumbMenuItem";
import { HugeiconsIcon } from "../HugeiconsIcon";
import { ChevronDown, ChevronRight } from "../Icons";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";

export const QUICK_NOTE_TARGET_VALUE = "__quick-note-today__";

export interface QuickNoteTarget {
	value: string;
	path: string;
	label: string;
}

interface BreadcrumbPart {
	label: string;
	path: string;
}

interface QuickNoteTargetBreadcrumbsProps {
	selectedTarget: QuickNoteTarget;
	quickNotesFolder: string;
	todayQuickNotePath: string;
	onSelectTarget: (target: QuickNoteTarget) => void;
}

const ROOT_PATH_KEY = "__root__";

function sortTargetEntries(entries: FsEntry[]) {
	return [...entries]
		.filter((entry) => entry.kind === "dir" || entry.is_markdown)
		.sort((a, b) => {
			if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
			return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
		});
}

function menuTitleForDir(path: string, rootLabel: string) {
	if (!path) return rootLabel;
	const parts = path.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? rootLabel;
}

function breadcrumbPartsForTarget(
	path: string,
	targetValue: string,
	todayQuickNotePath: string,
	labels: { root: string; today: string },
): BreadcrumbPart[] {
	return [
		{ label: labels.root, path: "" },
		...path
			.split("/")
			.filter(Boolean)
			.map((segment, index, segments): BreadcrumbPart => {
				const segmentPath = segments.slice(0, index + 1).join("/");
				const isFile = index === segments.length - 1;
				let label = isFile ? displayNameFromPath(segment) : segment;
				if (isFile && targetValue === QUICK_NOTE_TARGET_VALUE && path === todayQuickNotePath) {
					label = labels.today;
				}
				return { label, path: segmentPath };
			}),
	];
}

function fileTarget(path: string): QuickNoteTarget {
	return {
		value: path,
		path,
		label: displayNameFromPath(path),
	};
}

function todayQuickNoteTarget(todayQuickNotePath: string, label: string): QuickNoteTarget {
	return {
		value: QUICK_NOTE_TARGET_VALUE,
		path: todayQuickNotePath,
		label,
	};
}

function TargetBreadcrumbEntryMenu({
	open,
	dirPath,
	entries,
	loading,
	label,
	showSeparator,
	isCurrent,
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
	label: string;
	showSeparator: boolean;
	isCurrent: boolean;
	quickNotesFolder: string;
	todayQuickNotePath: string;
	selectedTargetValue: string;
	onOpenChange: (open: boolean) => void;
	onLoadDir: (dirPath: string) => Promise<void>;
	onSelectTarget: (target: QuickNoteTarget) => void;
	childrenByDir: Record<string, FsEntry[] | undefined>;
}) {
	const { t } = useTranslation("shell");
	const showTodayQuickNote = dirPath === quickNotesFolder;
	const dirTitle = menuTitleForDir(dirPath, t("breadcrumbs.space"));
	const todayLabel = t("quickNoteTarget.today");

	return (
		<DropdownMenu
			open={open}
			onOpenChange={(nextOpen) => {
				if (nextOpen && loading) void onLoadDir(dirPath);
				onOpenChange(nextOpen);
			}}
		>
			<DropdownMenuTrigger
				render={
					<button
						type="button"
						className="quickNoteTargetButton"
						aria-label={t("quickNoteTarget.browse", { name: dirTitle })}
						aria-current={isCurrent ? "page" : undefined}
						data-current={isCurrent ? "true" : undefined}
					/>
				}
			>
				{showSeparator ? (
					<ChevronRight size="var(--icon-xs)" className="quickNoteTargetSep" aria-hidden="true" />
				) : null}
				<span className="quickNoteTargetLabel">{label}</span>
				{isCurrent ? (
					<ChevronDown size="var(--icon-xs)" className="quickNoteTargetCaret" aria-hidden="true" />
				) : null}
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" side="bottom" className="breadcrumbMenu">
				<DropdownMenuLabel>{dirTitle}</DropdownMenuLabel>
				{showTodayQuickNote ? (
					<DropdownMenuItem
						title={todayQuickNotePath}
						onClick={() => onSelectTarget(todayQuickNoteTarget(todayQuickNotePath, todayLabel))}
					>
						<HugeiconsIcon
							icon={StickyNote03Icon}
							size="var(--icon-sm)"
							className="glyphMenuItemIcon"
							aria-hidden="true"
						/>
						<span className="glyphMenuItemLabel">{todayLabel}</span>
						{selectedTargetValue === QUICK_NOTE_TARGET_VALUE ? (
							<HugeiconsIcon
								icon={Tick02Icon}
								size="var(--icon-sm)"
								strokeWidth={2.25}
								className="glyphMenuItemCheck"
							/>
						) : null}
					</DropdownMenuItem>
				) : null}
				{loading ? null : entries.length === 0 ? (
					<div className="breadcrumbMenuState">{t("breadcrumbs.emptyFolder")}</div>
				) : (
					entries.map((entry) => (
						<DirectoryBreadcrumbMenuItem
							key={entry.rel_path || ROOT_PATH_KEY}
							entry={entry}
							childrenByDir={childrenByDir}
							onLoadDir={onLoadDir}
							onSelectFile={(relPath) => onSelectTarget(fileTarget(relPath))}
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
	const { t } = useTranslation("shell");
	const [childrenByDir, setChildrenByDir] = useState<Record<string, FsEntry[] | undefined>>({});
	const childrenByDirRef = useRef(childrenByDir);
	childrenByDirRef.current = childrenByDir;
	const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
	const breadcrumbParts = breadcrumbPartsForTarget(
		selectedTarget.path,
		selectedTarget.value,
		todayQuickNotePath,
		{ root: t("breadcrumbs.space"), today: t("quickNoteTarget.today") },
	);

	const loadDir = useCallback(async (dirPath: string) => {
		if (childrenByDirRef.current[dirPath] !== undefined) return;
		try {
			const entries = await invoke("space_list_dir", dirPath ? { dir: dirPath } : {});
			setChildrenByDir((current) => ({
				...current,
				[dirPath]: sortTargetEntries(entries),
			}));
		} catch (cause) {
			console.error("Failed to load quick note target directory", cause);
		}
	}, []);

	useEffect(() => {
		const segments = selectedTarget.path.split("/").filter(Boolean);
		const dirsToLoad = [
			"",
			...segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join("/")),
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
		<nav className="quickNoteTargetBreadcrumb" aria-label={t("quickNoteTarget.label")}>
			{breadcrumbParts.map((part, index) => {
				const isCurrent = index === breadcrumbParts.length - 1;
				const menuDirPath = breadcrumbParts[index - 1]?.path ?? "";
				const menuEntries = childrenByDir[menuDirPath];
				const menuItems = menuEntries ?? [];
				const menuKey = `${index}:${menuDirPath || ROOT_PATH_KEY}`;

				return (
					<TargetBreadcrumbEntryMenu
						key={part.path || ROOT_PATH_KEY}
						open={openMenuKey === menuKey}
						dirPath={menuDirPath}
						entries={menuItems}
						loading={menuEntries === undefined}
						label={part.label}
						showSeparator={index > 0}
						isCurrent={isCurrent}
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
				);
			})}
		</nav>
	);
}
