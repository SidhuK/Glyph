import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { ArrowRight01Icon, Folder01Icon } from "@hugeicons/core-free-icons";
import { Fragment } from "react";
import { parentDir } from "../../utils/path";

/** Folder depth shown in full; deeper paths keep the root and the last two folders. */
const MAX_SEGMENTS = 4;
const ELLIPSIS = "\u2026";

/** The note's folder, relative to the folder scope when one is chosen. */
function relativeFolder(notePath: string, folderPrefix: string | null): string {
	const dir = parentDir(notePath);
	if (!folderPrefix) return dir;
	if (dir === folderPrefix) return "";
	return dir.startsWith(`${folderPrefix}/`) ? dir.slice(folderPrefix.length + 1) : dir;
}

export function TaskNoteBreadcrumb({
	notePath,
	folderPrefix,
}: {
	notePath: string;
	folderPrefix: string | null;
}) {
	const folder = relativeFolder(notePath, folderPrefix);
	if (!folder) return null;
	const segments = folder.split("/");
	// The root tells same-named notes apart, so it stays; the middle collapses.
	const collapsed = segments.length > MAX_SEGMENTS;
	const shown = collapsed ? [segments[0], ELLIPSIS, ...segments.slice(-2)] : segments;
	return (
		<span className="tasksNoteBreadcrumb" title={folder}>
			<HugeiconsIcon icon={Folder01Icon} size="var(--icon-sm)" />
			{shown.map((segment, index) => (
				<Fragment key={`${index}:${segment}`}>
					{index > 0 ? (
						<HugeiconsIcon
							className="tasksNoteBreadcrumbSeparator"
							icon={ArrowRight01Icon}
							size="var(--icon-xs)"
						/>
					) : null}
					<span
						className={
							collapsed && index === 1
								? "tasksNoteBreadcrumbEllipsis"
								: "tasksNoteBreadcrumbSegment"
						}
					>
						{segment}
					</span>
				</Fragment>
			))}
		</span>
	);
}
