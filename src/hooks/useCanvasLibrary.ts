import { useCallback, useEffect, useState } from "react";
import {
	type CanvasLibraryMeta,
	createCanvas as createCanvasDoc,
	listCanvases,
	readCanvas,
	renameCanvas as renameCanvasDoc,
	touchCanvas,
} from "../lib/canvases";
import type { ViewDoc } from "../lib/views";

export function useCanvasLibrary() {
	const [canvases, setCanvases] = useState<CanvasLibraryMeta[]>([]);
	const [loading, setLoading] = useState(false);

	const refreshCanvases = useCallback(async () => {
		setLoading(true);
		try {
			const next = await listCanvases();
			setCanvases(next);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refreshCanvases();
	}, [refreshCanvases]);

	const createCanvas = useCallback(
		async (title?: string, source: "manual" | "ai" = "manual") => {
			const created = await createCanvasDoc({ title, source });
			await refreshCanvases();
			return created;
		},
		[refreshCanvases],
	);

	const openCanvas = useCallback(
		async (id: string): Promise<ViewDoc | null> => {
			return readCanvas(id);
		},
		[],
	);

	const markCanvasUpdated = useCallback(
		async (id: string, title?: string) => {
			await touchCanvas(id, title);
			await refreshCanvases();
		},
		[refreshCanvases],
	);

	const renameCanvas = useCallback(
		async (id: string, title: string) => {
			await renameCanvasDoc(id, title);
			await refreshCanvases();
		},
		[refreshCanvases],
	);

	return {
		canvases,
		loading,
		refreshCanvases,
		createCanvas,
		openCanvas,
		markCanvasUpdated,
		renameCanvas,
	};
}
