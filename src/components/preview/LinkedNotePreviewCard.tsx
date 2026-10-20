import { useTranslation } from "react-i18next";
import { NotePreviewContent } from "./NotePreviewContent";
import type { NotePreviewData } from "./notePreviewShared";

/** Drops a leading `# Title` heading that only repeats the card's title. */
function withoutTitleHeading(content: string, title: string): string {
	const match = content.match(/^(?:[ \t]*\n)*#[ \t]+(.+)\n*/);
	return match?.[1]?.trim() === title ? content.slice(match[0].length) : content;
}

/** The note's folder as a breadcrumb, or an empty string at the space root. */
function folderLabel(relPath: string): string {
	return relPath.split("/").slice(0, -1).join(" / ");
}

/** Short edit date: the year only shows when it isn't the current one. */
function editedLabel(mtimeMs: number, locale: string): string {
	const sameYear = new Date(mtimeMs).getFullYear() === new Date().getFullYear();
	const options: Intl.DateTimeFormatOptions = sameYear
		? { month: "short", day: "numeric" }
		: { dateStyle: "medium" };
	return new Intl.DateTimeFormat(locale, options).format(mtimeMs);
}

/** Body of the wiki-link hover card: folder and edit date, the title, then an excerpt. */
export function LinkedNotePreviewCard({ data }: { data: NotePreviewData }) {
	const { i18n } = useTranslation();
	if (data.status === "error") {
		return (
			<div className="linkedNotePreviewBody">
				<NotePreviewContent {...data} />
			</div>
		);
	}

	return (
		<>
			<header className="linkedNotePreviewHeader">
				<div className="linkedNotePreviewMeta">
					<span className="linkedNotePreviewFolder">{folderLabel(data.relPath)}</span>
					{data.mtimeMs > 0 ? (
						<time dateTime={new Date(data.mtimeMs).toISOString()}>
							{editedLabel(data.mtimeMs, i18n.language)}
						</time>
					) : null}
				</div>
				<div className="linkedNotePreviewTitle">{data.title}</div>
			</header>
			<div className="linkedNotePreviewBody">
				<NotePreviewContent {...data} content={withoutTitleHeading(data.content, data.title)} />
			</div>
		</>
	);
}
