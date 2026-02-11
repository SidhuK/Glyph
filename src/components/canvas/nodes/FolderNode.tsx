import { motion } from "motion/react";
import { memo, useMemo } from "react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "../../ui/shadcn/context-menu";
import { useCanvasActions } from "../contexts";

interface FolderNodeProps {
	data: Record<string, unknown>;
	id: string;
	selected?: boolean;
}

const PAPER_OFFSETS = [
	{ top: 18, stickOut: 14, rotate: -0.6 },
	{ top: 38, stickOut: 18, rotate: 0.4 },
	{ top: 56, stickOut: 11, rotate: -0.3 },
	{ top: 78, stickOut: 16, rotate: 0.7 },
	{ top: 98, stickOut: 13, rotate: -0.5 },
	{ top: 118, stickOut: 19, rotate: 0.2 },
	{ top: 140, stickOut: 12, rotate: -0.8 },
];

export const FolderNode = memo(function FolderNode({
	data,
	selected,
}: FolderNodeProps) {
	const { openFolder, newFileInDir, newFolderInDir, reflowGrid, renamePath } =
		useCanvasActions();
	const name = typeof data.name === "string" ? data.name : "Folder";
	const dir = typeof data.dir === "string" ? data.dir : "";
	const totalFiles =
		typeof data.total_files === "number" ? data.total_files : 0;
	const sheetCount = Math.min(PAPER_OFFSETS.length, Math.max(0, totalFiles));

	const papers = useMemo(
		() => PAPER_OFFSETS.slice(0, sheetCount),
		[sheetCount],
	);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<motion.div
					className="rfNode rfNodeFolder nodrag nopan"
					initial={{ opacity: 0, y: 12, scale: 0.97 }}
					animate={{
						opacity: 1,
						y: 0,
						scale: selected ? 1.01 : 1,
						boxShadow: selected
							? "0 0 0 2px color-mix(in srgb, var(--accent) 70%, white), 0 18px 36px rgba(14, 40, 60, 0.28)"
							: "0 14px 30px rgba(14, 40, 60, 0.2)",
					}}
					transition={{ type: "spring", stiffness: 320, damping: 26 }}
					layout
					aria-label={`Folder: ${name}`}
				>
					<button
						type="button"
						className="rfNodeFolderMain"
						onClick={() => {
							if (dir) openFolder(dir);
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								if (dir) openFolder(dir);
							}
						}}
						title={name}
						aria-label={`${name} — open folder`}
					>
						<div className="rfNodeFolderTab" />
						<div className="rfNodeFolderBack" />
						{papers.length > 0 ? (
							<div className="rfNodeFolderPapers" aria-hidden="true">
								{papers.map((p) => (
									<div
										key={p.top}
										className="rfNodeFolderPaper"
										style={{
											top: `${p.top}px`,
											right: `${-p.stickOut}px`,
											transform: `rotate(${p.rotate}deg)`,
										}}
									/>
								))}
							</div>
						) : null}
						<div className="rfNodeFolderBody" />
						<div className="rfNodeFolderNameWrap">
							<div className="rfNodeFolderNameLarge" title={name}>
								{name}
							</div>
						</div>
					</button>
				</motion.div>
			</ContextMenuTrigger>
			<ContextMenuContent className="fileTreeCreateMenu">
				<ContextMenuItem
					className="fileTreeCreateMenuItem"
					onSelect={() => {
						if (dir) openFolder(dir);
					}}
				>
					Open folder
				</ContextMenuItem>
				<ContextMenuSeparator className="fileTreeCreateMenuSeparator" />
				<ContextMenuItem
					className="fileTreeCreateMenuItem"
					onSelect={() => {
						const nextName = window.prompt("Rename folder", name);
						if (nextName == null || !dir) return;
						const trimmed = nextName.trim();
						if (!trimmed) return;
						void renamePath(dir, trimmed, "dir");
					}}
				>
					Rename
				</ContextMenuItem>
				<ContextMenuSeparator className="fileTreeCreateMenuSeparator" />
				<ContextMenuItem
					className="fileTreeCreateMenuItem"
					onSelect={() =>
						void (async () => {
							await newFileInDir(dir);
							reflowGrid();
						})()
					}
				>
					Add file
				</ContextMenuItem>
				<ContextMenuItem
					className="fileTreeCreateMenuItem"
					onSelect={() =>
						void (async () => {
							const created = await newFolderInDir(dir);
							if (created) reflowGrid();
						})()
					}
				>
					Add folder
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
});
