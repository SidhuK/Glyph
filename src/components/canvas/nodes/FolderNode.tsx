import { motion } from "motion/react";
import { memo, useEffect, useMemo, useRef } from "react";
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
	id,
	selected,
}: FolderNodeProps) {
	const {
		openFolder,
		toggleFolderFan,
		newFileInDir,
		newFolderInDir,
		reflowGrid,
		renamePath,
	} = useCanvasActions();
	const clickTimeoutRef = useRef<number | null>(null);
	const isExpanded = data.fan_expanded === true;
	const name = typeof data.name === "string" ? data.name : "Folder";
	const dir = typeof data.dir === "string" ? data.dir : "";
	const totalFiles =
		typeof data.total_files === "number" ? data.total_files : 0;
	const sheetCount = Math.min(PAPER_OFFSETS.length, Math.max(0, totalFiles));

	const papers = useMemo(
		() => PAPER_OFFSETS.slice(0, sheetCount),
		[sheetCount],
	);

	useEffect(
		() => () => {
			if (clickTimeoutRef.current != null) {
				window.clearTimeout(clickTimeoutRef.current);
			}
		},
		[],
	);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<motion.div
					className={`rfNode rfNodeFolder nodrag nopan ${isExpanded ? "rfNodeFolderOpen" : ""}`}
					initial={{ opacity: 0, y: 12, scale: 0.97 }}
					animate={{
						opacity: 1,
						y: 0,
						scale: selected ? 1.01 : 1,
						boxShadow: selected
							? "0 0 0 2px color-mix(in srgb, var(--accent) 70%, white), 0 18px 36px rgba(14, 40, 60, 0.28)"
							: isExpanded
								? "0 0 0 1px var(--border-focus), 0 14px 30px rgba(14, 40, 60, 0.2)"
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
							if (clickTimeoutRef.current != null) {
								window.clearTimeout(clickTimeoutRef.current);
							}
							clickTimeoutRef.current = window.setTimeout(() => {
								toggleFolderFan(id);
								clickTimeoutRef.current = null;
							}, 160);
						}}
						onDoubleClick={() => {
							if (clickTimeoutRef.current != null) {
								window.clearTimeout(clickTimeoutRef.current);
								clickTimeoutRef.current = null;
							}
							if (dir) openFolder(dir);
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								toggleFolderFan(id);
							}
						}}
						title={name}
						aria-label={`${name} — click to fan, double-click to open`}
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
					<button
						type="button"
						className="rfNodeFolderFanBtn"
						onClick={(e) => {
							e.stopPropagation();
							toggleFolderFan(id);
						}}
						aria-label={isExpanded ? "Collapse folder fan" : "Expand folder fan"}
						aria-expanded={isExpanded}
						title={isExpanded ? "Collapse" : "Expand"}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 14 14"
							fill="none"
							aria-hidden="true"
						>
							<path
								d={isExpanded ? "M3 8.5L7 4.5L11 8.5" : "M3 5.5L7 9.5L11 5.5"}
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
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
