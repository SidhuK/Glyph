import { useEffect, useRef } from "react";
import type { Command } from "../components/app/CommandPalette";
import { type Shortcut, isShortcutMatch } from "../lib/shortcuts";

interface UseCommandShortcutsProps {
	commands: Command[];
	paletteOpen: boolean;
	onOpenPalette: () => void;
	onOpenPaletteSearch: () => void;
	onClosePalette: () => void;
	openPaletteShortcuts: Shortcut[];
	openSearchShortcuts: Shortcut[];
}

export function useCommandShortcuts({
	commands,
	paletteOpen,
	onOpenPalette,
	onOpenPaletteSearch,
	onClosePalette,
	openPaletteShortcuts,
	openSearchShortcuts,
}: UseCommandShortcutsProps) {
	const commandsRef = useRef(commands);
	commandsRef.current = commands;

	const paletteOpenRef = useRef(paletteOpen);
	paletteOpenRef.current = paletteOpen;

	const openPaletteRef = useRef(onOpenPalette);
	openPaletteRef.current = onOpenPalette;

	const openSearchRef = useRef(onOpenPaletteSearch);
	openSearchRef.current = onOpenPaletteSearch;

	const closePaletteRef = useRef(onClosePalette);
	closePaletteRef.current = onClosePalette;

	const openPaletteShortcutsRef = useRef(openPaletteShortcuts);
	openPaletteShortcutsRef.current = openPaletteShortcuts;

	const openSearchShortcutsRef = useRef(openSearchShortcuts);
	openSearchShortcutsRef.current = openSearchShortcuts;

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (openSearchShortcutsRef.current.some((s) => isShortcutMatch(e, s))) {
				e.preventDefault();
				openSearchRef.current();
				return;
			}

			const t = e.target;
			const inEditableField =
				t instanceof HTMLElement &&
				(t.tagName === "INPUT" ||
					t.tagName === "TEXTAREA" ||
					t.isContentEditable);
			if (inEditableField) {
				if (!paletteOpenRef.current) {
					const saveCommand = commandsRef.current.find(
						(command) =>
							command.id === "save-note" &&
							command.enabled !== false &&
							Boolean(command.shortcut),
					);
					if (
						saveCommand?.shortcut &&
						isShortcutMatch(e, saveCommand.shortcut)
					) {
						e.preventDefault();
						void saveCommand.action();
					}
				}
				return;
			}

			if (openPaletteShortcutsRef.current.some((s) => isShortcutMatch(e, s))) {
				e.preventDefault();
				openPaletteRef.current();
				return;
			}

			if (paletteOpenRef.current && e.key === "Escape") {
				e.preventDefault();
				closePaletteRef.current();
				return;
			}
			if (paletteOpenRef.current) return;

			for (const command of commandsRef.current) {
				if (command.enabled === false || !command.shortcut) continue;
				if (!isShortcutMatch(e, command.shortcut)) continue;
				e.preventDefault();
				void command.action();
				return;
			}
		};

		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);
}
