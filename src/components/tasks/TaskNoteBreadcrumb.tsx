import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { ArrowRight01Icon, Folder01Icon } from "@hugeicons/core-free-icons";
import { Fragment } from "react";
import { parentDir } from "../../utils/path";

/** Trailing folder segments shown before collapsing the rest into a leading ellipsis. */
const MAX_SEGMENTS = 2;

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
	const shown = segments.length > MAX_SEGMENTS ? ["…", ...segments.slice(-MAX_SEGMENTS)] : segments;
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
					<span className="tasksNoteBreadcrumbSegment">{segment}</span>
				</Fragment>
			))}
		</span>
	);
}
