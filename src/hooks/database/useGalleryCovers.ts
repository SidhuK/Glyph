import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { DatabaseRow } from "../../lib/database/types";
import { excalidrawThumbnailUrl } from "../../lib/excalidrawThumbnail";
import { navigationQueryKeys } from "../../lib/navigationPrefetch";
import { type DatabaseGalleryCover, invoke, spaceAssetUrl } from "../../lib/tauri";
import { useIsDarkTheme } from "../useIsDarkTheme";

// Stable chunks keep cover queries cached while the visible window scrolls.
const COVER_CHUNK_SIZE = 48;

export type GalleryCoverImage =
	| { kind: "image"; src: string }
	| { kind: "drawing"; src: string | null };

function isDrawingPath(path: string): boolean {
	return path.toLowerCase().endsWith(".excalidraw");
}

interface UseGalleryCoversOptions {
	databaseId: string;
	viewId: string;
	cover: DatabaseGalleryCover;
	orderedRows: DatabaseRow[];
	visibleRange: { start: number; end: number };
}

export function useGalleryCovers({
	databaseId,
	viewId,
	cover,
	orderedRows,
	visibleRange,
}: UseGalleryCoversOptions): Map<string, GalleryCoverImage> {
	const darkMode = useIsDarkTheme();
	const coverKey = cover ?? "first_image";
	const chunks = useMemo(() => {
		if (cover === "none" || visibleRange.end <= visibleRange.start) return [];
		const first = Math.floor(visibleRange.start / COVER_CHUNK_SIZE);
		const last = Math.floor((visibleRange.end - 1) / COVER_CHUNK_SIZE);
		return Array.from({ length: last - first + 1 }, (_, offset) =>
			orderedRows
				.slice((first + offset) * COVER_CHUNK_SIZE, (first + offset + 1) * COVER_CHUNK_SIZE)
				.map((row) => row.note_path),
		);
	}, [cover, orderedRows, visibleRange.end, visibleRange.start]);

	const coverChunks = useQueries({
		combine: (results) => results.map((result) => result.data),
		queries: chunks.map((notePaths) => ({
			queryKey: navigationQueryKeys.databaseRowCovers(databaseId, viewId, coverKey, notePaths),
			queryFn: () =>
				invoke("databases_row_covers", {
					database_id: databaseId,
					view_id: viewId,
					note_paths: notePaths,
				}),
		})),
	});

	const resolved = useMemo(() => {
		const byNote = new Map<string, string>();
		chunks.forEach((notePaths, chunkIndex) => {
			const covers = coverChunks[chunkIndex];
			if (!covers) return;
			notePaths.forEach((notePath, index) => {
				const path = covers[index];
				if (path) byNote.set(notePath, path);
			});
		});
		return byNote;
	}, [chunks, coverChunks]);

	const drawingPaths = useMemo(
		() => Array.from(new Set([...resolved.values()].filter(isDrawingPath))).sort(),
		[resolved],
	);
	const drawings = useQuery({
		queryKey: navigationQueryKeys.databaseRowCovers(
			databaseId,
			viewId,
			darkMode ? "drawings-dark" : "drawings-light",
			drawingPaths,
		),
		queryFn: async () => {
			const docs = await invoke("space_read_texts_batch", { paths: drawingPaths });
			const thumbnails = new Map<string, string>();
			for (const doc of docs) {
				if (doc.text === null) continue;
				// A drawing that fails to render falls back to the text preview on its card.
				const url = await excalidrawThumbnailUrl(doc.text, darkMode).catch(() => null);
				if (url) thumbnails.set(doc.rel_path, url);
			}
			return thumbnails;
		},
		enabled: drawingPaths.length > 0,
	});

	return useMemo(() => {
		const images = new Map<string, GalleryCoverImage>();
		for (const [notePath, path] of resolved) {
			images.set(
				notePath,
				isDrawingPath(path)
					? { kind: "drawing", src: drawings.data?.get(path) ?? null }
					: { kind: "image", src: spaceAssetUrl(path) },
			);
		}
		return images;
	}, [drawings.data, resolved]);
}
