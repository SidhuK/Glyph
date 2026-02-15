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
	if (filtered.length === 0) {
		return <div className="commandPaletteEmpty">No commands</div>;
	}

	return (
		<>
			{filtered.map((cmd, index) => (
				<div
					key={cmd.id}
					className="commandPaletteItem"
					data-selected={index === selectedIndex}
					onMouseEnter={() => onSetSelectedIndex(index)}
					onMouseDown={(e) => {
						e.preventDefault();
						onRunCommand(index);
					}}
				>
					<span>{cmd.label}</span>
					{cmd.shortcut ? (
						<span
							className="commandPaletteShortcut"
							aria-label={formatShortcut(cmd.shortcut)}
						>
							{formatShortcutParts(cmd.shortcut).map((part) => (
								<kbd key={part}>{part}</kbd>
							))}
						</span>
					) : null}
				</div>
			))}
		</>
	);
}
