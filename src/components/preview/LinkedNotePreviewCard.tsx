import { useTranslation } from "react-i18next";
import { FileText } from "../Icons";
import { NotePreviewContent } from "./NotePreviewContent";
import type { NotePreviewData } from "./notePreviewShared";

/** Drops a leading `# Title` heading that only repeats the card's title. */
function withoutTitleHeading(content: string, title: string): string {
	const trimmed = content.trimStart();
	const match = trimmed.match(/^#\s+(.+)\n*/);
	return match?.[1]?.trim() === title ? trimmed.slice(match[0].length) : trimmed;
}

/** The note's place in the space, shown under its title like a handle. */
function notePathLabel(relPath: string): string {
	return relPath.replace(/\.md$/i, "");
}

/** Body of the wiki-link hover card: icon, title and path, an excerpt, then when it was edited. */
export function LinkedNotePreviewCard({ data }: { data: NotePreviewData }) {
	const { t, i18n } = useTranslation("editor");
	if (data.status === "error") {
		return (
			<div className="linkedNotePreviewBody">
				<NotePreviewContent {...data} />
			</div>
		);
	}

	const edited =
		data.mtimeMs > 0
			? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(data.mtimeMs)
			: null;
	return (
		<>
			<header className="linkedNotePreviewHeader">
				<span className="linkedNotePreviewIcon" aria-hidden="true">
					<FileText size="var(--icon-md)" />
				</span>
				<div className="linkedNotePreviewHeading">
					<div className="linkedNotePreviewTitle">{data.title}</div>
					<div className="linkedNotePreviewPath">{notePathLabel(data.relPath)}</div>
				</div>
			</header>
			<div className="linkedNotePreviewBody">
				<NotePreviewContent {...data} content={withoutTitleHeading(data.content, data.title)} />
			</div>
			{edited ? (
				<footer className="linkedNotePreviewMeta">
					{t("linkPreview.edited", { date: edited })}
				</footer>
			) : null}
		</>
	);
}
