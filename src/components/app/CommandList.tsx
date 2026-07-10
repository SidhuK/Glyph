import { Fragment, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
	formatShortcutForPlatform,
	formatShortcutPartsForPlatform,
} from "../../lib/shortcuts/platform";
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
	const { t } = useTranslation("shell");
	const generalCategory = t("commandPalette.sectionGeneral");
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
			const category = command.category?.trim() || generalCategory;
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
	}, [filtered, generalCategory]);

	if (filtered.length === 0) {
		return (
			<div className="commandPaletteEmpty">
				{t("commandPalette.noCommands")}
			</div>
		);
	}

	const showSectionLabels =
		sections.length > 1 ||
		(sections.length === 1 && sections[0]?.category !== generalCategory);

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
							<span className="commandPaletteItemMain">
								{command.icon ? (
									<span className="commandPaletteItemIcon">{command.icon}</span>
								) : null}
								<span>{command.label}</span>
							</span>
							{command.shortcut ? (
								<span
									className="commandPaletteShortcut"
									aria-label={formatShortcutForPlatform(command.shortcut)}
								>
									<kbd>
										<span className="commandPaletteShortcutCombo">
											{formatShortcutPartsForPlatform(command.shortcut).map(
												(part) => (
													<span
														key={`${command.id}-${part}`}
														className="commandPaletteShortcutPart"
													>
														{part}
													</span>
												),
											)}
										</span>
									</kbd>
								</span>
							) : null}
						</button>
					))}
				</Fragment>
			))}
		</>
	);
}
