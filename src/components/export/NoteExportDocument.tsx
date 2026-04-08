import { memo } from "react";
import { splitYamlFrontmatter } from "../../lib/notePreview";
import { CanvasNoteInlineEditor } from "../editor/CanvasNoteInlineEditor";

interface NoteExportDocumentProps {
	relPath: string;
	markdown: string;
}

export const NoteExportDocument = memo(function NoteExportDocument({
	relPath,
	markdown,
}: NoteExportDocumentProps) {
	const { body } = splitYamlFrontmatter(markdown);

	return (
		<main className="noteExportPage" data-export-root="true">
			<article className="noteExportCard">
				<div className="noteExportBody">
					<CanvasNoteInlineEditor
						markdown={body}
						relPath={relPath}
						mode="preview"
						onChange={() => {}}
						interactive={false}
						showBacklinks={false}
					/>
				</div>
			</article>
		</main>
	);
});
