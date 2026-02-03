import { memo, useMemo } from "react";
import { ChevronRight, FolderOpen } from "./Icons";

function joinPrefix(parts: string[], idxInclusive: number): string {
	return parts.slice(0, idxInclusive + 1).join("/");
}

export interface FolderBreadcrumbProps {
	dir: string;
	onOpenFolder: (dir: string) => void;
}

export const FolderBreadcrumb = memo(function FolderBreadcrumb({
	dir,
	onOpenFolder,
}: FolderBreadcrumbProps) {
	const crumbs = useMemo(() => {
		const parts = dir.split("/").filter(Boolean);
		return [{ label: "Vault", dir: "" }].concat(
			parts.map((p, idx) => ({ label: p, dir: joinPrefix(parts, idx) })),
		);
	}, [dir]);

	return (
		<div className="folderBreadcrumb">
			<span className="folderBreadcrumbIcon" aria-hidden>
				<FolderOpen size={16} />
			</span>
			<div className="folderBreadcrumbTrail" aria-label="Folder breadcrumb">
				{crumbs.map((c, idx) => {
					const isLast = idx === crumbs.length - 1;
					return (
						<div
							key={c.dir || "root"}
							className={isLast ? "folderCrumb isCurrent" : "folderCrumb"}
						>
							<button
								type="button"
								className={
									isLast ? "folderCrumbBtn isCurrent" : "folderCrumbBtn"
								}
								onClick={() => onOpenFolder(c.dir)}
								title={c.dir || "Vault"}
							>
								{c.label}
							</button>
							{!isLast ? (
								<span className="folderCrumbSep" aria-hidden>
									<ChevronRight size={14} />
								</span>
							) : null}
						</div>
					);
				})}
			</div>
		</div>
	);
});
