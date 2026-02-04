import { useEffect, useRef } from "react";

interface KeyHandlers {
	undo: () => void;
	redo: () => void;
	deleteSelection: () => void;
	saveInlineNow: () => void;
}

interface UseCanvasKeyboardProps {
	handlers: KeyHandlers;
	noteEditSessionActive: boolean;
	closeInlineEditor: () => Promise<void>;
}

export function useCanvasKeyboard({
	handlers,
	noteEditSessionActive,
	closeInlineEditor,
}: UseCanvasKeyboardProps) {
	const keyHandlersRef = useRef(handlers);

	useEffect(() => {
		keyHandlersRef.current = handlers;
	}, [handlers]);

	useEffect(() => {
		const isTypingTarget = (target: EventTarget | null): boolean => {
			const el = target instanceof HTMLElement ? target : null;
			if (!el) return false;
			return Boolean(el.closest("input, textarea, [contenteditable='true']"));
		};

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && noteEditSessionActive) {
				e.preventDefault();
				void closeInlineEditor();
				return;
			}
			const isMod = e.metaKey || e.ctrlKey;
			if (isMod && e.key.toLowerCase() === "s") {
				if (noteEditSessionActive) {
					e.preventDefault();
					keyHandlersRef.current.saveInlineNow();
				}
				return;
			}
			if (isTypingTarget(e.target)) return;
			if (isMod && e.key.toLowerCase() === "z") {
				e.preventDefault();
				if (e.shiftKey) keyHandlersRef.current.redo();
				else keyHandlersRef.current.undo();
				return;
			}
			if (e.key === "Delete" || e.key === "Backspace") {
				keyHandlersRef.current.deleteSelection();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [closeInlineEditor, noteEditSessionActive]);
}
