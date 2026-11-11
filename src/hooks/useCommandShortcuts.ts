import { useEffect, useRef } from "react";
import { type Shortcut, isShortcutMatch } from "../lib/shortcuts";

interface ShortcutHandler {
	id: string;
	shortcut: Shortcut | null | undefined;
	action: () => void | Promise<void>;
	enabled?: boolean;
	allowInEditable?: boolean;
}

interface UseCommandShortcutsProps {
	handlers: ShortcutHandler[];
	paletteOpen: boolean;
}

export function useCommandShortcuts({ handlers, paletteOpen }: UseCommandShortcutsProps) {
	const handlersRef = useRef(handlers);
	handlersRef.current = handlers;

	const paletteOpenRef = useRef(paletteOpen);
	paletteOpenRef.current = paletteOpen;

	useEffect(() => {
		const handleMatchedShortcut = (event: KeyboardEvent, editableOnly: boolean) => {
			for (const handler of handlersRef.current) {
				if (!handler.shortcut || handler.enabled === false) continue;
				if (editableOnly && handler.allowInEditable !== true) continue;
				if (!isShortcutMatch(event, handler.shortcut)) continue;
				event.preventDefault();
				void handler.action();
				return true;
			}
			return false;
		};

		const handler = (event: KeyboardEvent) => {
			const target = event.target;
			const inEditableField =
				target instanceof HTMLElement &&
				(target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

			// The palette owns its keys: its own Esc clears the query before it closes.
			if (paletteOpenRef.current) return;

			if (inEditableField) {
				handleMatchedShortcut(event, true);
				return;
			}

			handleMatchedShortcut(event, false);
		};

		window.addEventListener("keydown", handler, { capture: true });
		return () => {
			window.removeEventListener("keydown", handler, { capture: true });
		};
	}, []);
}
