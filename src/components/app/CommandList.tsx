import { Fragment, useMemo } from "react";
import { formatShortcut, formatShortcutParts } from "../../lib/shortcuts";
import type { Command } from "./commandPaletteHelpers";

interface CommandListProps {
	filtered: Command[];
	selectedIndex: number;
	onSetSelectedIndex: (index: number) => void;
	onRunCommand: (index: number) => void;
}

export function CommandList({
	filtered,
	selectedIndex,
	onSetSelectedIndex,
	onRunCommand,
}: CommandListProps) {
	const sections = useMemo(() => {
		const order: string[] = [];
		const grouped = new Map<
			string,
			Array<{
				command: Command;
				index: number;
			}>
		>();

		filtered.forEach((command, index) => {
			const category = command.category?.trim() || "General";
			if (!grouped.has(category)) {
				grouped.set(category, []);
				order.push(category);
			}
			grouped.get(category)?.push({ command, index });
		});

		return order.map((category) => ({
			category,
			items: grouped.get(category) ?? [],
		}));
	}, [filtered]);

	if (filtered.length === 0) {
		return <div className="commandPaletteEmpty">No commands</div>;
	}

	const showSectionLabels =
		sections.length > 1 ||
		(sections.length === 1 && sections[0]?.category !== "General");

	return (
		<>
			{sections.map((section) => (
				<Fragment key={section.category}>
					{showSectionLabels ? (
						<div className="commandPaletteSectionLabel">{section.category}</div>
					) : null}
					{section.items.map(({ command, index }) => (
						<button
							key={command.id}
							type="button"
							className="commandPaletteItem"
							data-command-index={index}
							data-selected={index === selectedIndex}
							onMouseEnter={() => onSetSelectedIndex(index)}
							onMouseDown={(e) => {
								e.preventDefault();
								onRunCommand(index);
							}}
						>
							<span>{command.label}</span>
							{command.shortcut ? (
								<span
									className="commandPaletteShortcut"
									aria-label={formatShortcut(command.shortcut)}
								>
									{formatShortcutParts(command.shortcut).map((part) => (
										<kbd key={part}>{part}</kbd>
									))}
								</span>
							) : null}
						</button>
					))}
				</Fragment>
			))}
		</>
	);
}
