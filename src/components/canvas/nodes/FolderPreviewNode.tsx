import { Handle, Position } from "@xyflow/react";
import { motion } from "motion/react";
import { memo } from "react";
import { useCanvasActions } from "../contexts";

interface FolderPreviewNodeProps {
	data: Record<string, unknown>;
}

export const FolderPreviewNode = memo(function FolderPreviewNode({
	data,
}: FolderPreviewNodeProps) {
	const { openFolder, holdFolderPreview, releaseFolderPreview } =
		useCanvasActions();
	const folderId = typeof data.folder_id === "string" ? data.folder_id : "";
	const relPath = typeof data.rel_path === "string" ? data.rel_path : "";
	const name =
		typeof data.name === "string"
			? data.name
			: relPath
				? (relPath.split("/").pop() ?? relPath)
				: "File";
	const moreCount = typeof data.more_count === "number" ? data.more_count : 0;
	const dir = typeof data.dir === "string" ? data.dir : "";
	const isMore = moreCount > 0;
	const previewIndex =
		typeof data.preview_index === "number" ? data.preview_index : 0;

	return (
		<motion.div
			className="rfNode rfNodeFolderPreviewNode nodrag nopan"
			onMouseEnter={() => {
				if (folderId) holdFolderPreview(folderId);
			}}
			onMouseLeave={() => {
				if (folderId) releaseFolderPreview(folderId);
			}}
			title={isMore ? "" : relPath}
			onClick={(e) => {
				e.stopPropagation();
				if (isMore && dir) openFolder(dir);
			}}
			initial={{ y: -10, scale: 0.96 }}
			animate={{ y: 0, scale: 1 }}
			transition={{
				type: "spring",
				stiffness: 520,
				damping: 32,
				delay: previewIndex * 0.035,
			}}
			whileHover={{ scale: 1.02 }}
		>
			<Handle type="target" position={Position.Top} />
			<div className="rfNodeFolderPreviewTitle">
				{isMore ? `+${moreCount} more` : name}
			</div>
			{isMore ? (
				<button
					type="button"
					className="rfNodeFolderPreviewAction nodrag nopan"
					onClick={(e) => {
						e.stopPropagation();
						if (dir) openFolder(dir);
					}}
				>
					Open
				</button>
			) : null}
		</motion.div>
	);
});
