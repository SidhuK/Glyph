import { createContext, useContext } from "react";
import type { CanvasActions, CanvasNoteEditActions } from "./types";

export const CanvasActionsContext = createContext<CanvasActions | null>(null);

export function useCanvasActions(): CanvasActions {
	const ctx = useContext(CanvasActionsContext);
	if (!ctx) throw new Error("CanvasActionsContext missing");
	return ctx;
}

export const CanvasNoteEditContext = createContext<CanvasNoteEditActions | null>(null);

export function useCanvasNoteEdit(): CanvasNoteEditActions {
	const ctx = useContext(CanvasNoteEditContext);
	if (!ctx) throw new Error("CanvasNoteEditContext missing");
	return ctx;
}
