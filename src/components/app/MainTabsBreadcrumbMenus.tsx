import { Folder01Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import type { FsEntry } from "../../lib/tauri";
import { isMarkdownPath } from "../../utils/path";
import { DirectoryBreadcrumbMenuItem } from "../DirectoryBreadcrumbMenuItem";
import { getFileTypeInfo } from "../filetree/fileTypeUtils";
import { ChevronRight } from "../Icons";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuItemIcon,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";

export interface BreadcrumbPart {
	label: string;
	path: string;
	kind: "folder" | "file";
}

export const ROOT_PATH_KEY = "__root__";

function BreadcrumbPartIcon({ part }: { part: BreadcrumbPart }) {
	if (part.kind === "folder") return <DropdownMenuItemIcon icon={Folder01Icon} />;
	const { Icon } = getFileTypeInfo(part.path, isMarkdownPath(part.path));
	return <Icon size="var(--icon-sm)" className="glyphMenuItemIcon" aria-hidden="true" />;
}

export function BreadcrumbOverflowMenu({
	hiddenParts,
	onNavigateDir,
	onOpenFile,
}: {
	hiddenParts: BreadcrumbPart[];
	onNavigateDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => Promise<void>;
}) {
	const { t } = useTranslation("shell");
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<button
						type="button"
						className="mainTabsBreadcrumbOverflowButton"
						title={t("breadcrumbs.hiddenItems", { count: hiddenParts.length })}
						aria-label={t("breadcrumbs.showHidden")}
					/>
				}
			>
				…
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" side="bottom" className="breadcrumbMenu">
				{hiddenParts.map((part) => (
					<DropdownMenuItem
						key={part.path || ROOT_PATH_KEY}
						title={part.path}
						onClick={() => {
							if (part.kind === "folder") {
								onNavigateDir(part.path);
								return;
							}
							void onOpenFile(part.path);
						}}
					>
						<BreadcrumbPartIcon part={part} />
						<span className="glyphMenuItemLabel">{part.label}</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function BreadcrumbEntryMenu({
	open,
	dirLabel,
	dirPath,
	entries,
	loading,
	onOpenChange,
	onLoadDir,
	onOpenFile,
	childrenByDir,
}: {
	open: boolean;
	dirLabel: string;
	dirPath: string;
	entries: FsEntry[];
	loading: boolean;
	onOpenChange: (open: boolean) => void;
	onLoadDir: (dirPath: string) => Promise<void>;
	onOpenFile: (relPath: string) => Promise<void>;
	childrenByDir: Record<string, FsEntry[] | undefined>;
}) {
	const { t } = useTranslation("shell");
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
						className="mainTabsBreadcrumbSepButton"
						aria-label={t("breadcrumbs.browse", { name: dirLabel })}
					/>
				}
			>
				<ChevronRight size="var(--icon-xs)" className="mainTabsBreadcrumbSep" aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" side="bottom" className="breadcrumbMenu">
				<DropdownMenuLabel>{dirLabel}</DropdownMenuLabel>
				{loading ? (
					<div className="breadcrumbMenuState">{t("breadcrumbs.loading")}</div>
				) : entries.length === 0 ? (
					<div className="breadcrumbMenuState">{t("breadcrumbs.emptyFolder")}</div>
				) : (
					entries.map((entry) => (
						<DirectoryBreadcrumbMenuItem
							key={entry.rel_path || ROOT_PATH_KEY}
							entry={entry}
							childrenByDir={childrenByDir}
							onLoadDir={onLoadDir}
							onSelectFile={(relPath) => void onOpenFile(relPath)}
						/>
					))
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
