import { useTranslation } from "react-i18next";
import { KEY_GLYPHS } from "../../lib/shortcuts/platform";
import type { PaletteResult } from "./paletteResults";
import type { PaletteSettingControl } from "./settingsPaletteRegistry";

interface FooterHint {
	keys: readonly string[];
	label:
		| "navigate"
		| "open"
		| "openInGlyph"
		| "switchTab"
		| "run"
		| "showNotes"
		| "create"
		| "search"
		| "allResults"
		| "moveHere"
		| "clear"
		| "cancel"
		| "dismiss"
		| "close"
		| "change"
		| "options"
		| "toggle"
		| "choose"
		| "apply"
		| "back";
}

/** Prefixes that narrow the search, labelled with their group names. */
const SCOPE_HINTS = [
	{ prefix: ">", group: "command" },
	{ prefix: "#", group: "tag" },
	{ prefix: "@", group: "person" },
] as const;

const NAVIGATE: FooterHint = {
	keys: [KEY_GLYPHS.ArrowUp, KEY_GLYPHS.ArrowDown],
	label: "navigate",
};

type EscapeLabel = "clear" | "close" | "cancel" | "dismiss";
type OpenLabel = "open" | "openInGlyph";

/** What Enter does for the selected row. */
function enterLabel(result: PaletteResult | undefined, openLabel: OpenLabel): FooterHint["label"] {
	// A content match jumps to its position, even when the note is already open.
	if (result?.kind === "open-tab" || (result?.kind === "note" && result.openTabId)) {
		return "switchTab";
	}
	switch (result?.kind) {
		case "command":
			return "run";
		case "tag":
		case "person":
			return "showNotes";
		case "action":
			return result.actionId === "create-note" ? "create" : "search";
		case "destination":
			return result.actionId === "create-folder" ? "create" : "moveHere";
		default:
			return openLabel;
	}
}

/** What the keys do for the selected row: choices step with ← → and list with ↩, toggles flip. */
function footerHints(
	result: PaletteResult | undefined,
	escapeLabel: EscapeLabel,
	openLabel: OpenLabel,
	canRemoveScope: boolean,
): readonly FooterHint[] {
	const trailing: FooterHint[] = [
		...(canRemoveScope ? [{ keys: [KEY_GLYPHS.Backspace], label: "allResults" } as const] : []),
		{ keys: [KEY_GLYPHS.Escape], label: escapeLabel },
	];
	if (result?.settingControl === "choice") {
		return [
			NAVIGATE,
			{ keys: [KEY_GLYPHS.ArrowLeft, KEY_GLYPHS.ArrowRight], label: "change" },
			{ keys: [KEY_GLYPHS.Enter], label: "options" },
			...trailing,
		];
	}
	if (result?.settingControl === "toggle") {
		return [NAVIGATE, { keys: [KEY_GLYPHS.Enter], label: "toggle" }, ...trailing];
	}
	return [
		NAVIGATE,
		{ keys: [KEY_GLYPHS.Enter], label: enterLabel(result, openLabel) },
		...trailing,
	];
}

function FooterHints({ hints }: { hints: readonly FooterHint[] }) {
	const { t } = useTranslation("shell");
	return hints.map((hint) => (
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
	));
}

/** The nested setting editor's keys; Esc steps back to the results rather than closing. */
export function CommandPaletteEditorFooter({ control }: { control: PaletteSettingControl }) {
	const back: FooterHint = { keys: [KEY_GLYPHS.Escape], label: "back" };
	const hints: readonly FooterHint[] =
		control === "choice" || control === "path"
			? [
					{ keys: [KEY_GLYPHS.ArrowUp, KEY_GLYPHS.ArrowDown], label: "choose" },
					{ keys: [KEY_GLYPHS.Enter], label: "apply" },
					back,
				]
			: [back];
	return (
		<div className="commandPaletteFooter">
			<FooterHints hints={hints} />
		</div>
	);
}

interface CommandPaletteFooterProps {
	selectedResult?: PaletteResult;
	/** What Esc does right now: clear the query, close, cancel a move, dismiss a window. */
	escapeLabel: EscapeLabel;
	/** Quick Search opens results in the main window, so it names Glyph. */
	openLabel?: OpenLabel;
	/** Scope prefixes are listed until one is in use. */
	showScopes: boolean;
	/** ⌫ removes the scope token while nothing follows it. */
	canRemoveScope: boolean;
}

/** Keyboard hints under the results, like the native launcher palettes. */
export function CommandPaletteFooter({
	selectedResult,
	escapeLabel,
	openLabel = "open",
	showScopes,
	canRemoveScope,
}: CommandPaletteFooterProps) {
	const { t } = useTranslation("shell");
	return (
		<div className="commandPaletteFooter">
			<FooterHints hints={footerHints(selectedResult, escapeLabel, openLabel, canRemoveScope)} />
			{showScopes ? (
				<span className="commandPaletteFooterScopes">
					{SCOPE_HINTS.map(({ prefix, group }) => (
						<span key={prefix} className="commandPaletteFooterHint">
							<kbd className="commandPaletteKeycap">{prefix}</kbd>
							{t(`commandPalette.groups.${group}`)}
						</span>
					))}
				</span>
			) : null}
		</div>
	);
}
