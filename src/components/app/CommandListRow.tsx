import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	File02Icon,
	Folder01Icon,
	Layout01Icon,
	TableIcon,
	Tag01Icon,
	UserIcon,
} from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import {
	formatShortcutForPlatform,
	formatShortcutPartsForPlatform,
} from "../../lib/shortcuts/platform";
import { PaletteSnippet } from "./CommandPaletteSnippet";
import type { PaletteResult } from "./paletteResults";
import { getPaletteSettingIcon } from "./settingsPaletteIcons";

/** Notes, open tabs and content matches share the plain document glyph. */
function resultIconFor(result: PaletteResult) {
	switch (result.kind) {
		case "setting":
			return getPaletteSettingIcon(result.settingId);
		case "folder":
			return Folder01Icon;
		case "tag":
			return Tag01Icon;
		case "person":
			return UserIcon;
		case "database":
			return TableIcon;
		case "template":
			return Layout01Icon;
		default:
			return File02Icon;
	}
}

function ResultIcon({ result }: { result: PaletteResult }) {
	if (result.kind === "command") return result.command?.icon ?? null;
	return <HugeiconsIcon icon={resultIconFor(result)} size="var(--icon-lg)" />;
}

function Shortcut({ result }: { result: PaletteResult }) {
	const shortcut = result.command?.shortcut;
	if (!shortcut) return null;
	return (
		<span className="commandPaletteShortcut" aria-label={formatShortcutForPlatform(shortcut)}>
			<kbd>
				<span className="commandPaletteShortcutCombo">
					{formatShortcutPartsForPlatform(shortcut).map((part) => (
						<span key={`${result.id}-${part}`} className="commandPaletteShortcutPart">
							{part}
						</span>
					))}
				</span>
			</kbd>
		</span>
	);
}

export function CommandListRowContent({ result }: { result: PaletteResult }) {
	const { t } = useTranslation("shell");
	return (
		<>
			<span className="commandPaletteItemMain">
				<span className="commandPaletteItemIcon" aria-hidden="true">
					<ResultIcon result={result} />
				</span>
				<span className="commandPaletteUniversalContent">
					<span className="commandPaletteResultHead">
						<span className="commandPaletteResultLine">
							<span className="commandPaletteResultTitle">{result.label}</span>
							{result.description ? (
								<>
									<LineSeparator />
									<span
										className="commandPaletteResultPath"
										title={result.descriptionTooltip ?? result.description}
									>
										{result.description}
									</span>
								</>
							) : null}
							{result.matchLine != null ? (
								<>
									<LineSeparator />
									<span className="commandPaletteResultLineNo">
										{t("commandPalette.lineNumber", { line: result.matchLine })}
									</span>
								</>
							) : null}
						</span>
						{typeof result.checked !== "boolean" && result.trailing ? (
							<span className="commandPaletteResultValue" title={result.trailing}>
								{result.trailing}
							</span>
						) : null}
					</span>
					{result.snippet ? (
						<span
							className="commandPaletteResultSnippet"
							data-lead={result.snippet.startsWith("…")}
						>
							<PaletteSnippet snippet={result.snippet} />
						</span>
					) : null}
				</span>
			</span>
			{typeof result.checked === "boolean" ? (
				<span className="commandPaletteInlineSettingValue">
					<span
						className="commandPaletteInlineToggle"
						data-checked={result.checked}
						aria-hidden="true"
					>
						<span />
					</span>
				</span>
			) : result.trailing ? null : (
				<Shortcut result={result} />
			)}
		</>
	);
}

function LineSeparator() {
	return (
		<span className="commandPaletteResultLineSep" aria-hidden="true">
			·
		</span>
	);
}
