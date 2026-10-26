import { useCallback, useState } from "react";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useFileTreeContext, useSpace } from "../../contexts";
import { ACTIVITY_TIMELINE_TAB_ID, INBOX_TAB_ID, ARCHIVE_TAB_ID } from "../../lib/activityTimeline";
import { AGENT_VIEW_TAB_ID } from "../../lib/agentView";
import { DATABASES_TAB_ID } from "../../lib/databases";
import { showNativeContextMenu } from "../../lib/nativeContextMenu";
import { buildPathCopyMenuItems } from "../../lib/pathClipboard";
import { SPACE_CONNECTIONS_TAB_ID } from "../../lib/spaceConnections";
import { TASKS_TAB_ID } from "../../lib/tasks";
import { type FsEntry, invoke } from "../../lib/tauri";
import { toast } from "../../lib/toast";
import { displayNameFromPath, isMarkdownPath, parentDir } from "../../utils/path";
import { AppearanceIcon } from "../AppearanceIcon";
import { ChevronRight } from "../Icons";
import { ActiveFileTitle } from "./ActiveFileTitle";
import {
	BreadcrumbEntryMenu,
	BreadcrumbOverflowMenu,
	type BreadcrumbPart,
} from "./MainTabsBreadcrumbMenus";

interface MainTabsBreadcrumbsProps {
	activeTabPath: string | null;
	childrenByDir: Record<string, FsEntry[] | undefined>;
	onNavigateBreadcrumbPath: (dirPath: string) => void;
	onLoadBreadcrumbDir: (dirPath: string) => Promise<void>;
	onOpenBreadcrumbFile: (relPath: string) => Promise<void>;
	onRenameFile: (path: string, nextName: string) => Promise<string | null>;
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

function sortBreadcrumbEntries(entries: FsEntry[]) {
	return [...entries].sort((a, b) => {
		if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
		return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
	});
}

export function isPathSpecial(path: string): boolean {
	return (
		path === INBOX_TAB_ID ||
		path === ARCHIVE_TAB_ID ||
		path === ACTIVITY_TIMELINE_TAB_ID ||
		path === AGENT_VIEW_TAB_ID ||
		path === DATABASES_TAB_ID ||
		path === SPACE_CONNECTIONS_TAB_ID ||
		path === TASKS_TAB_ID
	);
}

function breadcrumbDisplayItems(parts: BreadcrumbPart[]): BreadcrumbDisplayItem[] {
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

// The space root is left out, like the collection header: the sidebar already names the space.
function breadcrumbPartsForPath(path: string | null): BreadcrumbPart[] {
	if (!path || isPathSpecial(path)) return [];
	return path
		.split("/")
		.filter(Boolean)
		.map((segment, index, segments): BreadcrumbPart => {
			const isFile = index === segments.length - 1;
			return {
				label: isFile ? displayNameFromPath(segment) : segment,
				path: segments.slice(0, index + 1).join("/"),
				kind: isFile ? "file" : "folder",
			};
		});
}

/** Folder › note path beside the back/forward arrows. Folders reveal themselves in the file
 * tree, each chevron browses its folder, and the note name renames the note. */
export function MainTabsBreadcrumbs({
	activeTabPath,
	childrenByDir,
	onNavigateBreadcrumbPath,
	onLoadBreadcrumbDir,
	onOpenBreadcrumbFile,
	onRenameFile,
}: MainTabsBreadcrumbsProps) {
	const { t } = useTranslation("shell");
	const [openBreadcrumbMenuKey, setOpenBreadcrumbMenuKey] = useState<string | null>(null);
	const { spacePath } = useSpace();
	const { itemAppearance } = useFileTreeContext();
	const breadcrumbParts = breadcrumbPartsForPath(activeTabPath);
	const breadcrumbDisplay = breadcrumbDisplayItems(breadcrumbParts);
	const handleRevealInFinder = useCallback(
		async (part: BreadcrumbPart) => {
			try {
				await invoke("space_reveal_path", { path: part.path });
			} catch (error) {
				toast.error(t("breadcrumbs.showInFinderFailed"), {
					description: error instanceof Error ? error.message : undefined,
				});
			}
		},
		[t],
	);
	const handleBreadcrumbContextMenu = useCallback(
		(event: MouseEvent<HTMLButtonElement>, part: BreadcrumbPart) => {
			void showNativeContextMenu(event, [
				...buildPathCopyMenuItems(spacePath, part.path),
				{
					label: t("breadcrumbs.revealInFileTree"),
					action: () => {
						onNavigateBreadcrumbPath(part.kind === "folder" ? part.path : parentDir(part.path));
						if (part.kind === "file") void onOpenBreadcrumbFile(part.path);
					},
				},
				...(part.kind === "file"
					? [
							{ type: "separator" as const },
							{
								label: t("fileTree.showInFinder"),
								action: () => void handleRevealInFinder(part),
							},
						]
					: []),
			]).catch((error: unknown) => {
				console.error("Failed to show breadcrumb context menu", error);
			});
		},
		[handleRevealInFinder, onNavigateBreadcrumbPath, onOpenBreadcrumbFile, spacePath, t],
	);

	if (breadcrumbParts.length === 0) return null;

	return (
		<nav className="mainTabsBreadcrumb" aria-label={t("breadcrumbs.label")}>
			{breadcrumbDisplay.map((item, displayIndex) => {
				if (item.type === "overflow") {
					return (
						<span key="breadcrumb-overflow" className="mainTabsBreadcrumbItem">
							<ChevronRight
								size="var(--icon-xs)"
								className="mainTabsBreadcrumbSep"
								aria-hidden="true"
							/>
							<BreadcrumbOverflowMenu
								hiddenParts={item.hiddenParts}
								onNavigateDir={onNavigateBreadcrumbPath}
								onOpenFile={onOpenBreadcrumbFile}
							/>
						</span>
					);
				}

				const { part, originalIndex } = item;
				const isCurrent = originalIndex === breadcrumbParts.length - 1;
				const parentPart = displayIndex > 0 ? breadcrumbParts[originalIndex - 1] : undefined;
				const menuKey = `${originalIndex}:${parentPart?.path ?? ""}`;
				const parentEntries = parentPart ? childrenByDir[parentPart.path] : undefined;
				const appearanceIcon = itemAppearance[part.path]?.icon;

				return (
					<span
						key={part.path}
						className="mainTabsBreadcrumbItem"
						data-current={isCurrent ? "true" : undefined}
					>
						{parentPart ? (
							<BreadcrumbEntryMenu
								open={openBreadcrumbMenuKey === menuKey}
								dirLabel={parentPart.label}
								dirPath={parentPart.path}
								entries={sortBreadcrumbEntries(parentEntries ?? [])}
								loading={parentEntries === undefined}
								onOpenChange={(open) => setOpenBreadcrumbMenuKey(open ? menuKey : null)}
								onLoadDir={onLoadBreadcrumbDir}
								onOpenFile={onOpenBreadcrumbFile}
								childrenByDir={childrenByDir}
							/>
						) : null}
						{isCurrent && isMarkdownPath(part.path) ? (
							<ActiveFileTitle
								path={part.path}
								onRenameFile={onRenameFile}
								onContextMenu={(event) => handleBreadcrumbContextMenu(event, part)}
							/>
						) : (
							<button
								type="button"
								className="mainTabsBreadcrumbButton"
								aria-current={isCurrent ? "page" : undefined}
								aria-disabled={isCurrent}
								title={part.path}
								onClick={() => {
									if (part.kind === "folder") onNavigateBreadcrumbPath(part.path);
								}}
								onContextMenu={(event) => handleBreadcrumbContextMenu(event, part)}
							>
								{appearanceIcon ? (
									<AppearanceIcon iconName={appearanceIcon} size="var(--icon-sm)" />
								) : null}
								<span className="mainTabsBreadcrumbLabel">{part.label}</span>
							</button>
						)}
					</span>
				);
			})}
		</nav>
	);
}
