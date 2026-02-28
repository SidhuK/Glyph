import {
	type ReactNode,
	createContext,
	useContext,
	useEffect,
	useMemo,
	useRef,
} from "react";
import { useViewLoader } from "../hooks/useViewLoader";
import type { ViewDoc } from "../lib/views";
import { useSpace } from "./SpaceContext";

export interface ViewContextValue {
	activeViewDoc: ViewDoc | null;
	canvasLoadingMessage: string;
	activeViewDocRef: React.RefObject<ViewDoc | null>;
	activeViewPathRef: React.RefObject<string | null>;
	setActiveViewDoc: (doc: ViewDoc | null) => void;
	loadAndBuildFolderView: (dir: string) => Promise<void>;
	loadAndBuildSearchView: (query: string) => Promise<void>;
	loadAndBuildTagView: (tag: string) => Promise<void>;
}

const ViewContext = createContext<ViewContextValue | null>(null);

export function ViewProvider({ children }: { children: ReactNode }) {
	const { spacePath, setError, startIndexRebuild } = useSpace();
	const initialViewLoadSpaceRef = useRef<string | null>(null);
	const activeViewDocSnapshotRef = useRef<ViewDoc | null>(null);

	const {
		activeViewDoc,
		canvasLoadingMessage,
		activeViewDocRef,
		activeViewPathRef,
		setActiveViewDoc,
		loadAndBuildFolderView,
		loadAndBuildSearchView,
		loadAndBuildTagView,
	} = useViewLoader({ setError, startIndexRebuild });

	useEffect(() => {
		activeViewDocSnapshotRef.current = activeViewDoc;
	}, [activeViewDoc]);

	useEffect(() => {
		if (!spacePath) {
			initialViewLoadSpaceRef.current = null;
			return;
		}
		if (
			activeViewDocSnapshotRef.current ||
			initialViewLoadSpaceRef.current === spacePath
		)
			return;
		initialViewLoadSpaceRef.current = spacePath;
		void loadAndBuildFolderView("").finally(() => {
			if (initialViewLoadSpaceRef.current === spacePath)
				initialViewLoadSpaceRef.current = null;
		});
	}, [spacePath, loadAndBuildFolderView]);

	const value = useMemo<ViewContextValue>(
		() => ({
			activeViewDoc,
			canvasLoadingMessage,
			activeViewDocRef,
			activeViewPathRef,
			setActiveViewDoc,
			loadAndBuildFolderView,
			loadAndBuildSearchView,
			loadAndBuildTagView,
		}),
		[
			activeViewDoc,
			canvasLoadingMessage,
			activeViewDocRef,
			activeViewPathRef,
			setActiveViewDoc,
			loadAndBuildFolderView,
			loadAndBuildSearchView,
			loadAndBuildTagView,
		],
	);

	return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
}

export function useViewContext(): ViewContextValue {
	const ctx = useContext(ViewContext);
	if (!ctx) throw new Error("useViewContext must be used within ViewProvider");
	return ctx;
}
