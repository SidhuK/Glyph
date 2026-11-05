import { convertToExcalidrawElements, loadFromBlob } from "@excalidraw/excalidraw";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSpace } from "../../contexts";
import { agentCanvasSkeletons, excalidrawDocumentQueryKey } from "../../lib/excalidrawDocument";
import type { TextFileDoc } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";

export interface LoadedCanvasDocument {
	/** Bumped only when the scene is rebuilt from disk, so the canvas remounts on outside writes. */
	revision: number;
	/** Etag of the file as last loaded or saved by this pane. */
	diskEtag: string;
	document: TextFileDoc;
	scene:
		| Awaited<ReturnType<typeof loadFromBlob>>
		| {
				elements: ReturnType<typeof convertToExcalidrawElements>;
				appState: { viewBackgroundColor: string };
				files: Record<string, never>;
		  };
}

export function useExcalidrawDocumentQuery(relPath: string) {
	const { spacePath } = useSpace();
	const queryClient = useQueryClient();
	const queryKey = excalidrawDocumentQueryKey(spacePath, relPath);
	return useQuery({
		queryKey,
		queryFn: async (): Promise<LoadedCanvasDocument> => {
			const document = await invoke("space_read_text", { path: relPath });
			// This pane's own autosaves emit the same change events as outside writes. Keep the
			// mounted scene while the file holds what it last saved or a save is still in flight.
			const previous = queryClient.getQueryData<LoadedCanvasDocument>(queryKey);
			if (
				previous &&
				(previous.diskEtag === document.etag ||
					queryClient.isMutating({ mutationKey: queryKey }) > 0)
			) {
				return previous;
			}
			const agentSkeletons = agentCanvasSkeletons(document.text);
			const scene = agentSkeletons
				? {
						elements: convertToExcalidrawElements(agentSkeletons),
						appState: { viewBackgroundColor: "#ffffff" },
						files: {},
					}
				: await loadFromBlob(new Blob([document.text], { type: "application/json" }), null, null);
			return { revision: (previous?.revision ?? 0) + 1, diskEtag: document.etag, document, scene };
		},
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: 0,
	});
}

export function useCanvasSaveMutation(relPath: string) {
	const { spacePath } = useSpace();
	const queryClient = useQueryClient();
	const queryKey = excalidrawDocumentQueryKey(spacePath, relPath);
	return useMutation({
		mutationKey: queryKey,
		mutationFn: ({ text, baseMtimeMs }: { text: string; baseMtimeMs: number }) =>
			invoke("space_write_text", { path: relPath, text, base_mtime_ms: baseMtimeMs }),
		onSuccess: (result) => {
			queryClient.setQueryData<LoadedCanvasDocument>(
				queryKey,
				(current) => current && { ...current, diskEtag: result.etag },
			);
		},
	});
}
