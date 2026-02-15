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
	/** Whether the current editor has unsaved changes */
	isDirty: boolean;
	/** Function to save the current editor content */
	save: () => Promise<void>;
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

	return (
		<EditorContext.Provider
			value={{
				registerEditor,
				getEditorState,
				saveCurrentEditor,
				hasUnsavedChanges,
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

	const stateRef = useRef(state);
	stateRef.current = state;

	useEffect(() => {
		registerEditor(stateRef.current);
		return () => registerEditor(null);
	}, [registerEditor]);
}
