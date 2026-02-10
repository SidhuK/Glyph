import { useEffect } from "react";
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
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (openSearchShortcuts.some((s) => isShortcutMatch(e, s))) {
				e.preventDefault();
				onOpenPaletteSearch();
				return;
			}

			const t = e.target;
			if (
				t instanceof HTMLElement &&
				(t.tagName === "INPUT" ||
					t.tagName === "TEXTAREA" ||
					t.isContentEditable)
			) {
				return;
			}

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
	}, [
		commands,
		onClosePalette,
		onOpenPalette,
		onOpenPaletteSearch,
		openPaletteShortcuts,
		openSearchShortcuts,
		paletteOpen,
	]);
}
