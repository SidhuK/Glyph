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
			const inEditableField =
				t instanceof HTMLElement &&
				(t.tagName === "INPUT" ||
					t.tagName === "TEXTAREA" ||
					t.isContentEditable);
			if (inEditableField) {
				if (!paletteOpen) {
					const saveCommand = commands.find(
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
