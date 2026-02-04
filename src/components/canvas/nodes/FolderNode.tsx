import { memo } from "react";
import { FolderOpen } from "../../Icons";
import { useCanvasActions } from "../contexts";

interface FolderNodeProps {
	data: Record<string, unknown>;
	id: string;
}

export const FolderNode = memo(function FolderNode({
	data,
	id,
}: FolderNodeProps) {
	const { holdFolderPreview, releaseFolderPreview } = useCanvasActions();
	const name = typeof data.name === "string" ? data.name : "Folder";
	const totalFiles =
		typeof data.total_files === "number" ? data.total_files : 0;
	const totalMarkdown =
		typeof data.total_markdown === "number" ? data.total_markdown : 0;

	return (
		<div
			className="rfNode rfNodeFolder"
			onMouseEnter={() => holdFolderPreview(id)}
			onMouseLeave={() => releaseFolderPreview(id)}
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
		</div>
	);
});
