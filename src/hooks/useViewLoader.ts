import { useCallback, useRef, useState } from "react";
import {
	NeedsIndexRebuildError,
	type ViewDoc,
	type ViewRef,
	buildFolderViewDoc,
	buildSearchViewDoc,
	buildTagViewDoc,
	loadViewDoc,
	saveViewDoc,
} from "../lib/views";

export interface UseViewLoaderResult {
	activeViewPath: string | null;
	activeViewDoc: ViewDoc | null;
	canvasLoadingMessage: string;
	activeViewDocRef: React.RefObject<ViewDoc | null>;
	activeViewPathRef: React.RefObject<string | null>;
	setActiveViewDoc: (doc: ViewDoc | null) => void;
	loadAndBuildFolderView: (dir: string) => Promise<void>;
	loadAndBuildSearchView: (query: string) => Promise<void>;
	loadAndBuildTagView: (tag: string) => Promise<void>;
}

export interface UseViewLoaderDeps {
	setError: (error: string) => void;
	startIndexRebuild: () => Promise<void>;
}

type ViewBuildResult = { doc: ViewDoc; changed: boolean };

export function useViewLoader(deps: UseViewLoaderDeps): UseViewLoaderResult {
	const { setError, startIndexRebuild } = deps;

	const [activeViewPath, setActiveViewPath] = useState<string | null>(null);
	const [activeViewDoc, setActiveViewDoc] = useState<ViewDoc | null>(null);
	const [canvasLoadingMessage, setCanvasLoadingMessage] = useState<string>("");

	const activeViewDocRef = useRef<ViewDoc | null>(null);
	const activeViewPathRef = useRef<string | null>(null);
	const loadRequestVersionRef = useRef(0);

	const setActiveViewDocAndRef = useCallback((doc: ViewDoc | null) => {
		setActiveViewDoc(doc);
		activeViewDocRef.current = doc;
	}, []);

	const loadAndBuildView = useCallback(
		async (
			view: ViewRef,
			buildFn: (existing: ViewDoc | null) => Promise<ViewBuildResult>,
		) => {
			const requestVersion = loadRequestVersionRef.current + 1;
			loadRequestVersionRef.current = requestVersion;
			const isStale = () => loadRequestVersionRef.current !== requestVersion;
			setError("");
			setCanvasLoadingMessage("");
			try {
				const loaded = await loadViewDoc(view);
				if (isStale()) return;
				if (loaded.doc) {
					setActiveViewPath(loaded.path);
					setActiveViewDocAndRef(loaded.doc);
					activeViewPathRef.current = loaded.path;
				}

				let existingDoc = loaded.doc;
				const buildAndSet = async () => {
					const built = await buildFn(existingDoc);
					if (isStale()) return;
					if (!existingDoc || built.changed) {
						await saveViewDoc(loaded.path, built.doc);
					}
					if (isStale()) return;
					existingDoc = built.doc;
					setActiveViewPath(loaded.path);
					setActiveViewDocAndRef(built.doc);
					activeViewPathRef.current = loaded.path;
				};

				try {
					await buildAndSet();
				} catch (e) {
					if (e instanceof NeedsIndexRebuildError) {
						if (loaded.doc) {
							void (async () => {
								await startIndexRebuild();
								if (isStale()) return;
								try {
									await buildAndSet();
								} catch {
									// ignore
								}
							})();
							return;
						}
						setCanvasLoadingMessage("Indexing vault…");
						await startIndexRebuild();
						if (isStale()) return;
						setCanvasLoadingMessage("");
						await buildAndSet();
						return;
					}
					throw e;
				}
			} catch (e) {
				if (isStale()) return;
				setCanvasLoadingMessage("");
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[setError, startIndexRebuild, setActiveViewDocAndRef],
	);

	const loadAndBuildFolderView = useCallback(
		(dir: string) =>
			loadAndBuildView({ kind: "folder", dir }, (existing) =>
				buildFolderViewDoc(dir, { recursive: true, limit: 500 }, existing),
			),
		[loadAndBuildView],
	);

	const loadAndBuildSearchView = useCallback(
		async (query: string) => {
			const q = query.trim();
			if (!q) return;
			return loadAndBuildView({ kind: "search", query: q }, (existing) =>
				buildSearchViewDoc(q, { limit: 200 }, existing),
			);
		},
		[loadAndBuildView],
	);

	const loadAndBuildTagView = useCallback(
		async (tag: string) => {
			const t = tag.trim();
			if (!t) return;
			return loadAndBuildView({ kind: "tag", tag: t }, (existing) =>
				buildTagViewDoc(t, { limit: 500 }, existing),
			);
		},
		[loadAndBuildView],
	);

	return {
		activeViewPath,
		activeViewDoc,
		canvasLoadingMessage,
		activeViewDocRef,
		activeViewPathRef,
		setActiveViewDoc: setActiveViewDocAndRef,
		loadAndBuildFolderView,
		loadAndBuildSearchView,
		loadAndBuildTagView,
	};
}
