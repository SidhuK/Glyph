import { useQuery } from "@tanstack/react-query";
import { isMissingFileError } from "../../lib/fsErrors";
import { invoke } from "../../lib/tauri";
import { countWords } from "../../lib/textStats";

export const QUICK_NOTE_TARGET_SUMMARY_KEY = "quick-note-target-summary";

interface TargetSummary {
	exists: boolean;
	words: number;
}

async function readTargetSummary(path: string): Promise<TargetSummary> {
	try {
		const doc = await invoke("space_read_text", { path });
		return { exists: true, words: countWords(doc.text) };
	} catch (cause) {
		if (isMissingFileError(cause)) return { exists: false, words: 0 };
		throw cause;
	}
}

function summaryLabel(summary: TargetSummary): string {
	if (!summary.exists) return "New note";
	if (summary.words === 0) return "Appending to an empty note";
	return `Appending · ${summary.words.toLocaleString()} words`;
}

/** Tells the user what the next save will do before they start typing. */
export function QuickNoteTargetSummary({ path }: { path: string }) {
	const summary = useQuery({
		queryKey: [QUICK_NOTE_TARGET_SUMMARY_KEY, path],
		queryFn: () => readTargetSummary(path),
		enabled: Boolean(path),
	});

	if (!summary.data) return null;
	return (
		<span className="quickNoteTargetSummary">{summaryLabel(summary.data)}</span>
	);
}
