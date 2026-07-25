import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
} from "react";
import type { EditorViewMode } from "../lib/editorMode";

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
	/** Change the current editor's presentation mode. */
	setMode?: (mode: EditorViewMode) => void;
}

/**
 * Context value for editor operations
 */
interface EditorContextValue {
	/** Register an editor's save state */
	registerEditor: (state: EditorSaveState) => () => void;
	activateEditor: (state: EditorSaveState) => () => void;
	/** Get the current editor's save state */
	getEditorState: () => EditorSaveState | null;
	/** Save the current editor if dirty */
	saveCurrentEditor: () => Promise<boolean>;
	/** Check if current editor has unsaved changes */
	hasUnsavedChanges: () => boolean;
	/** Get the current editor content as markdown for a specific note */
	getCurrentMarkdown: (relPath: string) => string | null;
	/** Change the active editor's presentation mode. */
	setCurrentEditorMode: (mode: EditorViewMode) => boolean;
}

const EditorContext = createContext<EditorContextValue | null>(null);

/**
 * Provider for editor state across the application
 * Used to coordinate save shortcuts and dirty state tracking
 */
export function EditorProvider({ children }: { children: ReactNode }) {
	const editorStateRef = useRef<EditorSaveState | null>(null);
	const registeredEditorsRef = useRef(new Set<EditorSaveState>());

	const registerEditor = useCallback((state: EditorSaveState) => {
		registeredEditorsRef.current.add(state);
		return () => {
			registeredEditorsRef.current.delete(state);
			if (editorStateRef.current === state) {
				editorStateRef.current = null;
			}
		};
	}, []);

	const activateEditor = useCallback((state: EditorSaveState) => {
		editorStateRef.current = state;
		return () => {
			if (editorStateRef.current === state) editorStateRef.current = null;
		};
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
		for (const editor of registeredEditorsRef.current) {
			if (editor.isDirty) return true;
		}
		return false;
	}, []);

	const getCurrentMarkdown = useCallback((relPath: string) => {
		const activeEditor = editorStateRef.current;
		if (activeEditor?.relPath === relPath) {
			return activeEditor.getMarkdown?.() ?? null;
		}
		for (const editor of registeredEditorsRef.current) {
			if (editor.relPath === relPath) return editor.getMarkdown?.() ?? null;
		}
		return null;
	}, []);

	const setCurrentEditorMode = useCallback((mode: EditorViewMode) => {
		const setMode = editorStateRef.current?.setMode;
		if (!setMode) return false;
		setMode(mode);
		return true;
	}, []);

	return (
		<EditorContext.Provider
			value={{
				registerEditor,
				activateEditor,
				getEditorState,
				saveCurrentEditor,
				hasUnsavedChanges,
				getCurrentMarkdown,
				setCurrentEditorMode,
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
export function useEditorRegistration(
	state: EditorSaveState | null,
	active = true,
): void {
	const { activateEditor, registerEditor } = useEditorContext();

	useEffect(() => {
		if (!state) return;
		return registerEditor(state);
	}, [registerEditor, state]);

	useEffect(() => {
		if (!state || !active) return;
		return activateEditor(state);
	}, [activateEditor, active, state]);
}
