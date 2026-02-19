import { m } from "motion/react";
import { useMemo } from "react";
import { formatShortcutPartsForPlatform } from "../../lib/shortcuts/platform";
import { SHORTCUTS } from "../../lib/shortcuts/registry";
import type { ShortcutDefinition } from "../../lib/shortcuts/registry";
import { Dialog, DialogContent, DialogTitle } from "../ui/shadcn/dialog";

interface KeyboardShortcutsHelpProps {
	open: boolean;
	onClose: () => void;
}

/**
 * Group shortcuts by category
 */
function groupByCategory(
	shortcuts: ShortcutDefinition[],
): Record<string, ShortcutDefinition[]> {
	return shortcuts.reduce(
		(acc: Record<string, ShortcutDefinition[]>, shortcut) => {
			const category = shortcut.category;
			if (!acc[category]) {
				acc[category] = [];
			}
			acc[category].push(shortcut);
			return acc;
		},
		{},
	);
}

const CATEGORY_LABELS: Record<string, string> = {
	navigation: "Navigation",
	file: "File Operations",
	search: "Search & Command Palette",
	editor: "Editor",
	canvas: "Canvas",
	window: "Window & App",
};

/**
 * Dialog showing all keyboard shortcuts organized by category
 */
export function KeyboardShortcutsHelp({
	open,
	onClose,
}: KeyboardShortcutsHelpProps) {
	const grouped = useMemo(() => groupByCategory(SHORTCUTS), []);

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent className="keyboardShortcutsHelp sm:max-w-[500px]">
				<DialogTitle>Keyboard Shortcuts</DialogTitle>
				<div className="keyboardShortcutsContent">
					{Object.entries(grouped).map(([category, shortcuts]) => (
						<m.div
							key={category}
							className="keyboardShortcutsGroup"
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.15 }}
						>
							<h3 className="keyboardShortcutsGroupLabel">
								{CATEGORY_LABELS[category] || category}
							</h3>
							<div className="keyboardShortcutsList">
								{shortcuts.map((shortcut) => (
									<div key={shortcut.id} className="keyboardShortcutItem">
										<span className="keyboardShortcutLabel">
											{shortcut.label}
										</span>
										<span className="keyboardShortcutKeys">
											{formatShortcutPartsForPlatform(shortcut.shortcut).map(
												(part) => (
													<kbd key={part}>{part}</kbd>
												),
											)}
										</span>
									</div>
								))}
							</div>
						</m.div>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
