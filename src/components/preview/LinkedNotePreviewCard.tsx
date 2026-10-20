import { useDateDisplayFormat } from "../../contexts";
import { formatDisplayDate } from "../../lib/dateDisplayFormat";
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

/** Body of the wiki-link hover card: folder and edit date, the title, then an excerpt. */
export function LinkedNotePreviewCard({ data }: { data: NotePreviewData }) {
	const dateDisplayFormat = useDateDisplayFormat();
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
							{formatDisplayDate(data.mtimeMs, dateDisplayFormat)}
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
