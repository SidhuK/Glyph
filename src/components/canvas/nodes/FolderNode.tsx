import { motion } from "motion/react";
import { memo } from "react";
import { FolderOpen } from "../../Icons";
import { useCanvasActions } from "../contexts";

interface FolderNodeProps {
	data: Record<string, unknown>;
	id: string;
	selected?: boolean;
}

export const FolderNode = memo(function FolderNode({
	data,
	id,
	selected,
}: FolderNodeProps) {
	const { holdFolderPreview, releaseFolderPreview } = useCanvasActions();
	const name = typeof data.name === "string" ? data.name : "Folder";
	const totalFiles =
		typeof data.total_files === "number" ? data.total_files : 0;
	const totalMarkdown =
		typeof data.total_markdown === "number" ? data.total_markdown : 0;

	return (
		<motion.div
			className="rfNode rfNodeFolder"
			onMouseEnter={() => holdFolderPreview(id)}
			onMouseLeave={() => releaseFolderPreview(id)}
			initial={{ opacity: 0, scale: 0.95 }}
			animate={{
				opacity: 1,
				scale: 1,
				boxShadow: selected
					? "0 0 0 2px var(--accent), 0 4px 12px rgba(0,0,0,0.15)"
					: "0 2px 8px rgba(0,0,0,0.1)",
			}}
			transition={{ duration: 0.15 }}
		>
			<div className="rfNodeFolderIconLarge">
				<FolderOpen size={44} />
			</div>
			<div className="rfNodeFolderNameLarge" title={name}>
				{name}
			</div>
			<div className="rfNodeFolderMetaLarge">
				{totalMarkdown} md • {totalFiles} files
			</div>
		</motion.div>
	);
});
