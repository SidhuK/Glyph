import { type ReactNode, createContext, useContext } from "react";
import { type GitSyncController, useGitSync } from "../hooks/useGitSync";
import { useEditorContext } from "./EditorContext";
import { useSpace } from "./SpaceContext";

const GitSyncContext = createContext<GitSyncController | null>(null);

export function GitSyncProvider({ children }: { children: ReactNode }) {
	const { spacePath } = useSpace();
	const { saveAllEditors } = useEditorContext();
	const gitSync = useGitSync({ spacePath, saveEditors: saveAllEditors });
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
