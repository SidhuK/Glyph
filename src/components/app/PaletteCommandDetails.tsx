import { useTranslation } from "react-i18next";
import { formatShortcutPartsForPlatform } from "../../lib/shortcuts/platform";
import { isShortcutActionId } from "../../lib/shortcuts/registry";
import type { Command } from "./commandPaletteHelpers";

interface PaletteCommandDetailsProps {
	command: Command | undefined;
	onEditShortcut: () => void;
}

/** The side pane for a selected command: what it does and how to reach it from the keyboard. */
export function PaletteCommandDetails({ command, onEditShortcut }: PaletteCommandDetailsProps) {
	const { t } = useTranslation("shell");
	if (!command) return null;
	return (
		<div className="commandPaletteDetails">
			<div className="commandPaletteDetailsKicker">
				{[command.category, t("commandPalette.commandKind")].filter(Boolean).join(" · ")}
			</div>
			<div className="commandPaletteDetailsTitle">{command.label ?? command.id}</div>
			{command.description ? (
				<p className="commandPaletteDetailsText">{command.description}</p>
			) : null}
			{command.shortcut ? (
				<div className="commandPaletteDetailsRow">
					<span>{t("commandPalette.shortcut")}</span>
					<span className="commandPaletteFooterKeys">
						{formatShortcutPartsForPlatform(command.shortcut).map((part) => (
							<kbd key={part} className="commandPaletteKeycap">
								{part}
							</kbd>
						))}
					</span>
				</div>
			) : null}
			{isShortcutActionId(command.id) ? (
				<button type="button" className="commandPaletteDetailsLink" onClick={onEditShortcut}>
					{t("commandPalette.editShortcut")}
				</button>
			) : null}
		</div>
	);
}
