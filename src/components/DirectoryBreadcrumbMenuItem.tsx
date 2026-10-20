import { useTranslation } from "react-i18next";
import type { FsEntry } from "../lib/tauri";
import { displayNameFromPath } from "../utils/path";
import {
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "./ui/shadcn/dropdown-menu";

const DIRECTORY_BREADCRUMB_CHILD_LIMIT = 40;
const ROOT_PATH_KEY = "__root__";

export function DirectoryBreadcrumbMenuItem({
	entry,
	childrenByDir,
	onLoadDir,
	onSelectFile,
}: {
	entry: FsEntry;
	childrenByDir: Record<string, FsEntry[] | undefined>;
	onLoadDir: (dirPath: string) => Promise<void>;
	onSelectFile: (relPath: string) => void;
}) {
	const { t } = useTranslation("shell");
	const childEntries = childrenByDir[entry.rel_path];
	const loading = childEntries === undefined;
	const isDir = entry.kind === "dir";

	if (!isDir) {
		return (
			<DropdownMenuItem
				key={entry.rel_path || ROOT_PATH_KEY}
				title={entry.rel_path || entry.name}
				onClick={() => onSelectFile(entry.rel_path)}
			>
				<span className="glyphMenuItemLabel">
					{entry.is_markdown ? displayNameFromPath(entry.name) : entry.name}
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
			<DropdownMenuSubTrigger>
				<span className="glyphMenuItemLabel">{entry.name}</span>
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="breadcrumbMenu" sideOffset={4}>
				{loading ? (
					<div className="breadcrumbMenuState">{t("breadcrumbs.loading")}</div>
				) : childEntries.length === 0 ? (
					<div className="breadcrumbMenuState">{t("breadcrumbs.emptyFolder")}</div>
				) : (
					<>
						{childEntries.slice(0, DIRECTORY_BREADCRUMB_CHILD_LIMIT).map((child) => (
							<DirectoryBreadcrumbMenuItem
								key={child.rel_path || ROOT_PATH_KEY}
								entry={child}
								childrenByDir={childrenByDir}
								onLoadDir={onLoadDir}
								onSelectFile={onSelectFile}
							/>
						))}
						{childEntries.length > DIRECTORY_BREADCRUMB_CHILD_LIMIT ? (
							<div className="breadcrumbMenuState">
								{t("breadcrumbs.moreItems", {
									count: childEntries.length - DIRECTORY_BREADCRUMB_CHILD_LIMIT,
								})}
							</div>
						) : null}
					</>
				)}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
