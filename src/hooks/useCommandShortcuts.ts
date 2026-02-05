import { useEffect } from "react";
import { isShortcutMatch, type Shortcut } from "../lib/shortcuts";
import type { Command } from "../components/app/CommandPalette";

interface UseCommandShortcutsProps {
	commands: Command[];
	paletteOpen: boolean;
	onOpenPalette: () => void;
	onClosePalette: () => void;
	openPaletteShortcuts: Shortcut[];
}

export function useCommandShortcuts({
	commands,
	paletteOpen,
	onOpenPalette,
	onClosePalette,
	openPaletteShortcuts,
}: UseCommandShortcutsProps) {
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (openPaletteShortcuts.some((s) => isShortcutMatch(e, s))) {
				e.preventDefault();
				onOpenPalette();
				return;
			}

			if (paletteOpen && e.key === "Escape") {
				e.preventDefault();
				onClosePalette();
				return;
			}
			if (paletteOpen) return;

			for (const command of commands) {
				if (command.enabled === false || !command.shortcut) continue;
				if (!isShortcutMatch(e, command.shortcut)) continue;
				e.preventDefault();
				void command.action();
				return;
			}
		};

		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [commands, onClosePalette, onOpenPalette, openPaletteShortcuts, paletteOpen]);
}
