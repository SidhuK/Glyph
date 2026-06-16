import { type ReactNode, createContext, useContext } from "react";
import { useGitSync } from "../hooks/useGitSync";
import type { GitSyncStatus } from "../lib/tauri";
import { useEditorContext } from "./EditorContext";
import { useSpace } from "./SpaceContext";

interface GitSyncController {
	status: GitSyncStatus | null;
	loading: boolean;
	error: string;
	refreshStatus: () => Promise<void>;
	syncNow: () => Promise<GitSyncStatus>;
	resumeAutoSync: () => Promise<void>;
	openGitSettings: () => void;
}

const GitSyncContext = createContext<GitSyncController | null>(null);

export function GitSyncProvider({ children }: { children: ReactNode }) {
	const { spacePath } = useSpace();
	const { saveCurrentEditor } = useEditorContext();
	const gitSync = useGitSync({ spacePath, saveCurrentEditor });
	return (
		<GitSyncContext.Provider value={gitSync}>
			{children}
		</GitSyncContext.Provider>
	);
}

export function useGitSyncContext(): GitSyncController {
	const context = useContext(GitSyncContext);
	if (!context) {
		throw new Error("useGitSyncContext must be used within a GitSyncProvider");
	}
	return context;
}
