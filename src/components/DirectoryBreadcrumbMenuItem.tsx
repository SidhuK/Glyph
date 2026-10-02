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
	itemClassName,
	labelClassName,
	menuClassName,
	stateClassName,
}: {
	entry: FsEntry;
	childrenByDir: Record<string, FsEntry[] | undefined>;
	onLoadDir: (dirPath: string) => Promise<void>;
	onSelectFile: (relPath: string) => void;
	itemClassName: string;
	labelClassName: string;
	menuClassName: string;
	stateClassName: string;
}) {
	const { t } = useTranslation("shell");
	const childEntries = childrenByDir[entry.rel_path];
	const loading = childEntries === undefined;
	const isDir = entry.kind === "dir";

	if (!isDir) {
		return (
			<DropdownMenuItem
				key={entry.rel_path || ROOT_PATH_KEY}
				className={itemClassName}
				title={entry.rel_path || entry.name}
				onSelect={() => onSelectFile(entry.rel_path)}
			>
				<span className={labelClassName}>
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
			<DropdownMenuSubTrigger className={itemClassName}>
				<span className={labelClassName}>{entry.name}</span>
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className={menuClassName} sideOffset={4}>
				{loading ? (
					<div className={stateClassName}>{t("breadcrumbs.loading")}</div>
				) : childEntries.length === 0 ? (
					<div className={stateClassName}>{t("breadcrumbs.emptyFolder")}</div>
				) : (
					<>
						{childEntries.slice(0, DIRECTORY_BREADCRUMB_CHILD_LIMIT).map((child) => (
							<DirectoryBreadcrumbMenuItem
								key={child.rel_path || ROOT_PATH_KEY}
								entry={child}
								childrenByDir={childrenByDir}
								onLoadDir={onLoadDir}
								onSelectFile={onSelectFile}
								itemClassName={itemClassName}
								labelClassName={labelClassName}
								menuClassName={menuClassName}
								stateClassName={stateClassName}
							/>
						))}
						{childEntries.length > DIRECTORY_BREADCRUMB_CHILD_LIMIT ? (
							<div className={stateClassName}>
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
