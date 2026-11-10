import { useTranslation } from "react-i18next";
import { KEY_GLYPHS } from "../../lib/shortcuts/platform";
import type { PaletteResult } from "./paletteResults";

interface FooterHint {
	keys: readonly string[];
	label: "navigate" | "open" | "close" | "change" | "options" | "toggle";
}

const NAVIGATE: FooterHint = {
	keys: [KEY_GLYPHS.ArrowUp, KEY_GLYPHS.ArrowDown],
	label: "navigate",
};
const CLOSE: FooterHint = { keys: [KEY_GLYPHS.Escape], label: "close" };

/** What the keys do for the selected row: choices step with ← → and list with ↩, toggles flip. */
function footerHints(result: PaletteResult | undefined): readonly FooterHint[] {
	if (result?.settingControl === "choice") {
		return [
			NAVIGATE,
			{ keys: [KEY_GLYPHS.ArrowLeft, KEY_GLYPHS.ArrowRight], label: "change" },
			{ keys: [KEY_GLYPHS.Enter], label: "options" },
			CLOSE,
		];
	}
	if (result?.settingControl === "toggle") {
		return [NAVIGATE, { keys: [KEY_GLYPHS.Enter], label: "toggle" }, CLOSE];
	}
	return [NAVIGATE, { keys: [KEY_GLYPHS.Enter], label: "open" }, CLOSE];
}

/** Keyboard hints under the results, like the native launcher palettes. */
export function CommandPaletteFooter({ selectedResult }: { selectedResult?: PaletteResult }) {
	const { t } = useTranslation("shell");
	return (
		<div className="commandPaletteFooter">
			{footerHints(selectedResult).map((hint) => (
				<span key={hint.label} className="commandPaletteFooterHint">
					<span className="commandPaletteFooterKeys">
						{hint.keys.map((key) => (
							<kbd key={key} className="commandPaletteKeycap">
								{key}
							</kbd>
						))}
					</span>
					{t(`commandPalette.footer.${hint.label}`)}
				</span>
			))}
		</div>
	);
}
