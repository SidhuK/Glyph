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

export function useViewLoader(deps: UseViewLoaderDeps): UseViewLoaderResult {
	const { setError, startIndexRebuild } = deps;

	const [activeViewPath, setActiveViewPath] = useState<string | null>(null);
	const [activeViewDoc, setActiveViewDoc] = useState<ViewDoc | null>(null);
	const [canvasLoadingMessage, setCanvasLoadingMessage] = useState<string>("");

	const activeViewDocRef = useRef<ViewDoc | null>(null);
	const activeViewPathRef = useRef<string | null>(null);
	const loadRequestVersionRef = useRef(0);

	const loadAndBuildFolderView = useCallback(
		async (dir: string) => {
			const requestVersion = loadRequestVersionRef.current + 1;
			loadRequestVersionRef.current = requestVersion;
			const isStale = () => loadRequestVersionRef.current !== requestVersion;
			setError("");
			setCanvasLoadingMessage("");
			try {
				const view: ViewRef = { kind: "folder", dir };

				const loaded = await loadViewDoc(view);
				if (isStale()) return;
				if (loaded.doc) {
					setActiveViewPath(loaded.path);
					setActiveViewDoc(loaded.doc);
					activeViewDocRef.current = loaded.doc;
					activeViewPathRef.current = loaded.path;
				}

				let existingDoc = loaded.doc;
				const buildAndSet = async () => {
					const built = await buildFolderViewDoc(
						dir,
						{ recursive: true, limit: 500 },
						existingDoc,
					);
					if (isStale()) return;
					if (!existingDoc || built.changed) {
						await saveViewDoc(loaded.path, built.doc);
					}
					if (isStale()) return;
					existingDoc = built.doc;
					setActiveViewPath(loaded.path);
					setActiveViewDoc(built.doc);
					activeViewDocRef.current = built.doc;
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
		[setError, startIndexRebuild],
	);

	const loadAndBuildSearchView = useCallback(
		async (query: string) => {
			const requestVersion = loadRequestVersionRef.current + 1;
			loadRequestVersionRef.current = requestVersion;
			const isStale = () => loadRequestVersionRef.current !== requestVersion;
			setError("");
			setCanvasLoadingMessage("");
			try {
				const q = query.trim();
				if (!q) return;
				const view: ViewRef = { kind: "search", query: q };

				const loaded = await loadViewDoc(view);
				if (isStale()) return;
				if (loaded.doc) {
					setActiveViewPath(loaded.path);
					setActiveViewDoc(loaded.doc);
					activeViewDocRef.current = loaded.doc;
					activeViewPathRef.current = loaded.path;
				}

				let existingDoc = loaded.doc;
				const buildAndSet = async () => {
					const built = await buildSearchViewDoc(
						q,
						{ limit: 200 },
						existingDoc,
					);
					if (isStale()) return;
					if (!existingDoc || built.changed) {
						await saveViewDoc(loaded.path, built.doc);
					}
					if (isStale()) return;
					existingDoc = built.doc;
					setActiveViewPath(loaded.path);
					setActiveViewDoc(built.doc);
					activeViewDocRef.current = built.doc;
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
		[setError, startIndexRebuild],
	);

	const loadAndBuildTagView = useCallback(
		async (tag: string) => {
			const requestVersion = loadRequestVersionRef.current + 1;
			loadRequestVersionRef.current = requestVersion;
			const isStale = () => loadRequestVersionRef.current !== requestVersion;
			setError("");
			setCanvasLoadingMessage("");
			try {
				const t = tag.trim();
				if (!t) return;
				const view: ViewRef = { kind: "tag", tag: t };

				const loaded = await loadViewDoc(view);
				if (isStale()) return;
				if (loaded.doc) {
					setActiveViewPath(loaded.path);
					setActiveViewDoc(loaded.doc);
					activeViewDocRef.current = loaded.doc;
					activeViewPathRef.current = loaded.path;
				}

				let existingDoc = loaded.doc;
				const buildAndSet = async () => {
					const built = await buildTagViewDoc(t, { limit: 500 }, existingDoc);
					if (isStale()) return;
					if (!existingDoc || built.changed) {
						await saveViewDoc(loaded.path, built.doc);
					}
					if (isStale()) return;
					existingDoc = built.doc;
					setActiveViewPath(loaded.path);
					setActiveViewDoc(built.doc);
					activeViewDocRef.current = built.doc;
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
		[setError, startIndexRebuild],
	);

	return {
		activeViewPath,
		activeViewDoc,
		canvasLoadingMessage,
		activeViewDocRef,
		activeViewPathRef,
		setActiveViewDoc,
		loadAndBuildFolderView,
		loadAndBuildSearchView,
		loadAndBuildTagView,
	};
}
