import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
} from "react";

/**
 * Interface for editor save functionality
 */
export interface EditorSaveState {
	/** Relative path for the editor's current document */
	relPath: string;
	/** Whether the current editor has unsaved changes */
	isDirty: boolean;
	/** Function to save the current editor content */
	save: () => Promise<void>;
	/** Function to get the current editor content as markdown */
	getMarkdown?: () => string | null;
}

/**
 * Context value for editor operations
 */
interface EditorContextValue {
	/** Register an editor's save state */
	registerEditor: (state: EditorSaveState | null) => void;
	/** Get the current editor's save state */
	getEditorState: () => EditorSaveState | null;
	/** Save the current editor if dirty */
	saveCurrentEditor: () => Promise<boolean>;
	/** Check if current editor has unsaved changes */
	hasUnsavedChanges: () => boolean;
	/** Get the current editor content as markdown for a specific note */
	getCurrentMarkdown: (relPath: string) => string | null;
}

const EditorContext = createContext<EditorContextValue | null>(null);

/**
 * Provider for editor state across the application
 * Used to coordinate save shortcuts and dirty state tracking
 */
export function EditorProvider({ children }: { children: ReactNode }) {
	const editorStateRef = useRef<EditorSaveState | null>(null);

	const registerEditor = useCallback((state: EditorSaveState | null) => {
		editorStateRef.current = state;
	}, []);

	const getEditorState = useCallback(() => {
		return editorStateRef.current;
	}, []);

	const saveCurrentEditor = useCallback(async () => {
		const state = editorStateRef.current;
		if (!state) return false;
		await state.save();
		return true;
	}, []);

	const hasUnsavedChanges = useCallback(() => {
		return editorStateRef.current?.isDirty ?? false;
	}, []);

	const getCurrentMarkdown = useCallback((relPath: string) => {
		const state = editorStateRef.current;
		if (!state || state.relPath !== relPath) return null;
		return state.getMarkdown?.() ?? null;
	}, []);

	return (
		<EditorContext.Provider
			value={{
				registerEditor,
				getEditorState,
				saveCurrentEditor,
				hasUnsavedChanges,
				getCurrentMarkdown,
			}}
		>
			{children}
		</EditorContext.Provider>
	);
}

/**
 * Hook to access the editor context
 */
export function useEditorContext(): EditorContextValue {
	const ctx = useContext(EditorContext);
	if (!ctx) {
		throw new Error("useEditorContext must be used within EditorProvider");
	}
	return ctx;
}

/**
 * Hook for editor components to register their save state
 */
export function useEditorRegistration(state: EditorSaveState | null): void {
	const { registerEditor } = useEditorContext();

	useEffect(() => {
		registerEditor(state);
		return () => registerEditor(null);
	}, [registerEditor, state]);
}
