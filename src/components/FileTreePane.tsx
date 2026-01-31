import { memo } from "react";
import type { FsEntry } from "../lib/tauri";
import { ChevronDown, ChevronRight, FileText, Plus } from "./Icons";

interface FileTreePaneProps {
	rootEntries: FsEntry[];
	childrenByDir: Record<string, FsEntry[] | undefined>;
	expandedDirs: Set<string>;
	activeFilePath: string | null;
	onToggleDir: (dirPath: string) => void;
	onOpenFile: (filePath: string) => void;
	onNewFile: () => void;
}

function basename(relPath: string): string {
	if (!relPath) return "";
	const parts = relPath.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? relPath;
}

export const FileTreePane = memo(function FileTreePane({
	rootEntries,
	childrenByDir,
	expandedDirs,
	activeFilePath,
	onToggleDir,
	onOpenFile,
	onNewFile,
}: FileTreePaneProps) {
	const renderEntries = (entries: FsEntry[], parentDepth: number) => {
		return (
			<ul className="fileTreeList">
				{entries.map((e) => {
					const isDir = e.kind === "dir";
					const isExpanded = isDir && expandedDirs.has(e.rel_path);
					const depth = parentDepth + 1;
					const paddingLeft = 10 + depth * 10;

					if (isDir) {
						const children = childrenByDir[e.rel_path];
						return (
							<li key={e.rel_path} className="fileTreeItem">
								<button
									type="button"
									className="fileTreeRow"
									onClick={() => onToggleDir(e.rel_path)}
									style={{ paddingLeft }}
								>
									<span className="fileTreeChevron">
										{isExpanded ? (
											<ChevronDown size={14} />
										) : (
											<ChevronRight size={14} />
										)}
									</span>
									<span className="fileTreeName">{e.name}</span>
								</button>
								{isExpanded && children ? renderEntries(children, depth) : null}
							</li>
						);
					}

					const isActive = e.rel_path === activeFilePath;
					const disabled = !e.is_markdown;
					return (
						<li
							key={e.rel_path}
							className={isActive ? "fileTreeItem active" : "fileTreeItem"}
						>
							<button
								type="button"
								className="fileTreeRow"
								onClick={() => onOpenFile(e.rel_path)}
								disabled={disabled}
								style={{ paddingLeft }}
								title={disabled ? "Only Markdown files are supported (for now)." : e.rel_path}
							>
								<span className="fileTreeIcon">
									<FileText size={14} />
								</span>
								<span className="fileTreeName">{basename(e.rel_path)}</span>
							</button>
						</li>
					);
				})}
			</ul>
		);
	};

	return (
		<aside className="fileTreePane">
			<div className="fileTreeHeader">
				<h2 className="fileTreeTitle">
					<FileText size={14} />
					Files
				</h2>
				<button
					type="button"
					className="iconBtn"
					onClick={onNewFile}
					title="New Markdown file"
				>
					<Plus size={16} />
				</button>
			</div>
			{rootEntries.length ? (
				<div className="fileTreeScroll">{renderEntries(rootEntries, -1)}</div>
			) : (
				<div className="fileTreeEmpty">No files found.</div>
			)}
		</aside>
	);
});
