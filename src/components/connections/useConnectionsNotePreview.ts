import { useQuery } from "@tanstack/react-query";
import { useSpace } from "../../contexts";
import { markdownPreviewSnippet } from "../../lib/notePreview";
import { invoke } from "../../lib/tauri";

export const CONNECTIONS_PREVIEW_QUERY_ROOT = "connections-note-preview";
const PREVIEW_MAX_BYTES = 4096;
const PREVIEW_LINE_LIMIT = 3;

export function useConnectionsNotePreview(id: string, enabled: boolean) {
	const { spacePath } = useSpace();
	return useQuery({
		queryKey: [CONNECTIONS_PREVIEW_QUERY_ROOT, spacePath, id],
		enabled: Boolean(spacePath) && enabled,
		queryFn: async () => {
			const [doc] = await invoke("space_read_text_previews_batch", {
				paths: [id],
				max_bytes: PREVIEW_MAX_BYTES,
			});
			if (doc?.error) throw new Error(doc.error);
			return doc?.text
				? markdownPreviewSnippet(doc.text, { lineLimit: PREVIEW_LINE_LIMIT, skipHeadings: true })
				: "";
		},
	});
}
