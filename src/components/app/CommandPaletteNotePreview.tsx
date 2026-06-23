import { NotePreviewContent } from "../preview/NotePreviewContent";
import { NOTE_PREVIEW_OPEN_DELAY_MS } from "../preview/notePreviewShared";
import { useNotePreview } from "../preview/useNotePreview";

interface CommandPaletteNotePreviewProps {
	path: string | null;
}

export function CommandPaletteNotePreview({
	path,
}: CommandPaletteNotePreviewProps) {
	const preview = useNotePreview(path, {
		delayMs: NOTE_PREVIEW_OPEN_DELAY_MS,
	});

	return (
		<aside
			className="commandPalettePreview"
			aria-label={path ? "Note preview" : undefined}
			aria-hidden={path ? undefined : true}
		>
			<div className="linkedNotePreviewBody">
				{preview ? <NotePreviewContent {...preview} /> : null}
			</div>
		</aside>
	);
}
