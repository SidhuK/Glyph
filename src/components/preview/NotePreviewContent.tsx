import { useTranslation } from "react-i18next";
import { displayFolderFromPath } from "../../utils/path";
import { NoteInlineEditor } from "../editor/NoteInlineEditor";
import { useGitHistoryDates } from "./gitHistoryShared";
import type { NotePreviewData } from "./notePreviewShared";

type NotePreviewContentProps = NotePreviewData & {
	/** Marks each occurrence of the search that surfaced this note. */
	highlightQuery?: string;
	matchCount?: number;
	/** Leads with the note's folder, edit time and match count. */
	showMeta?: boolean;
};

function NotePreviewMeta({
	relPath,
	mtimeMs,
	matchCount,
}: {
	relPath: string;
	mtimeMs: number;
	matchCount?: number;
}) {
	const { t } = useTranslation("shell");
	const dates = useGitHistoryDates();
	const parts = [
		displayFolderFromPath(relPath) || t("folio.noFolder"),
		t("commandPalette.previewEdited", { when: dates.relative(mtimeMs) }),
		matchCount ? t("commandPalette.previewMatches", { count: matchCount }) : null,
	].filter(Boolean);
	return <div className="notePreviewMeta">{parts.join(" · ")}</div>;
}

export function NotePreviewContent({
	highlightQuery,
	matchCount,
	showMeta = false,
	...data
}: NotePreviewContentProps) {
	if (data.status === "error") {
		return <div className="markdownEditorInfoEmpty">{data.message}</div>;
	}

	const meta = showMeta ? (
		<NotePreviewMeta relPath={data.relPath} mtimeMs={data.mtimeMs} matchCount={matchCount} />
	) : null;

	if (!data.content.trim()) {
		return (
			<>
				{meta}
				<div className="markdownEditorInfoEmpty">Empty note</div>
			</>
		);
	}

	return (
		<>
			{meta}
			<div className="linkedNotePreviewText">
				<NoteInlineEditor
					markdown={data.content}
					relPath={data.relPath}
					mode="preview"
					onChange={() => {}}
					interactive={false}
					acceptSearchJumps={false}
					highlightQuery={highlightQuery?.trim()}
					deferHeavyFeatures
				/>
			</div>
		</>
	);
}
