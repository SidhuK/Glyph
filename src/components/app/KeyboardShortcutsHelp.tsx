import { m } from "motion/react";
import { useMemo } from "react";
import type { Shortcut } from "../../lib/shortcuts";
import { formatShortcutPartsForPlatform } from "../../lib/shortcuts/platform";
import {
	SHORTCUT_CATEGORY_LABELS,
	type ShortcutActionDefinition,
} from "../../lib/shortcuts/registry";
import { Dialog, DialogContent, DialogTitle } from "../ui/shadcn/dialog";

interface KeyboardShortcutsHelpProps {
	actions: Array<ShortcutActionDefinition & { binding: Shortcut | null }>;
	open: boolean;
	onClose: () => void;
}

function groupByCategory(
	actions: Array<ShortcutActionDefinition & { binding: Shortcut | null }>,
) {
	return actions.reduce<
		Partial<
			Record<
				ShortcutActionDefinition["category"],
				Array<ShortcutActionDefinition & { binding: Shortcut | null }>
			>
		>
	>((acc, action) => {
		if (!action.binding) return acc;
		const group = acc[action.category] ?? [];
		group.push(action);
		acc[action.category] = group;
		return acc;
	}, {});
}

export function KeyboardShortcutsHelp({
	actions,
	open,
	onClose,
}: KeyboardShortcutsHelpProps) {
	const grouped = useMemo(() => groupByCategory(actions), [actions]);

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent className="keyboardShortcutsHelp sm:max-w-[500px]">
				<DialogTitle>Keyboard Shortcuts</DialogTitle>
				<div className="keyboardShortcutsContent">
					{Object.entries(grouped).map(([category, categoryActions]) => (
						<m.div
							key={category}
							className="keyboardShortcutsGroup"
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.15 }}
						>
							<h3 className="keyboardShortcutsGroupLabel">
								{SHORTCUT_CATEGORY_LABELS[
									category as ShortcutActionDefinition["category"]
								] ?? category}
							</h3>
							<div className="keyboardShortcutsList">
								{categoryActions?.map((action) => (
									<div key={action.id} className="keyboardShortcutItem">
										<span className="keyboardShortcutLabel">
											{action.label}
										</span>
										<span className="keyboardShortcutKeys">
											{action.binding
												? formatShortcutPartsForPlatform(action.binding).map(
														(part) => (
															<kbd key={`${action.id}-${part}`}>{part}</kbd>
														),
													)
												: null}
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
