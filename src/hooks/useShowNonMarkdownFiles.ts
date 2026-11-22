import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSpace } from "../contexts";
import { loadSettings } from "../lib/settings";
import { SPACE_SETTINGS } from "../lib/settings/definitions";
import { useTauriEvent } from "../lib/tauriEvents";

function showNonMarkdownFilesQueryKey(spacePath: string | null) {
	return ["settings", "show-non-markdown-files", spacePath] as const;
}

/** Per-space visibility of non-Markdown files in the file tree and Folio list; null while loading. */
export function useShowNonMarkdownFiles(): boolean | null {
	const { spacePath } = useSpace();
	const queryClient = useQueryClient();
	const queryKey = showNonMarkdownFilesQueryKey(spacePath);
	const query = useQuery({
		queryKey,
		queryFn: async () => (await loadSettings({ spacePath })).ui.showNonMarkdownFiles,
		enabled: Boolean(spacePath),
	});

	useTauriEvent("settings:updated", (payload) => {
		const next = payload.ui?.showNonMarkdownFiles;
		if (typeof next !== "boolean" || !payload.spacePath) return;
		queryClient.setQueryData(showNonMarkdownFilesQueryKey(payload.spacePath), next);
	});

	if (!spacePath) return SPACE_SETTINGS.showNonMarkdownFiles.defaultValue;
	return query.data ?? null;
}
