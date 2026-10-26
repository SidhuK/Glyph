import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	File02Icon,
	Folder01Icon,
	Layout01Icon,
	TableIcon,
	Tag01Icon,
	UserIcon,
} from "@hugeicons/core-free-icons";
import { Fragment, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
	formatShortcutForPlatform,
	formatShortcutPartsForPlatform,
} from "../../lib/shortcuts/platform";
import { Highlight, HighlightItem } from "../ui/shadcn/highlight";
import { PaletteSnippet } from "./CommandPaletteSnippet";
import type { PaletteResult, PaletteResultKind } from "./paletteResults";
import { getPaletteSettingIcon } from "./settingsPaletteIcons";

interface CommandListProps {
	results: PaletteResult[];
	selectedIndex: number;
	onSetSelectedIndex: (index: number) => void;
	onSelectResult: (index: number) => void;
}

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

const FOOTER_HINTS = [
	{ keys: ["↑", "↓"], label: "navigate" },
	{ keys: ["↵"], label: "open" },
	{ keys: ["esc"], label: "close" },
] as const;

/** Keyboard hints under the results, like the native launcher palettes. */
export function CommandPaletteFooter() {
	const { t } = useTranslation("shell");
	return (
		<div className="commandPaletteFooter">
			{FOOTER_HINTS.map((hint) => (
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

export function CommandList({
	results,
	selectedIndex,
	onSetSelectedIndex,
	onSelectResult,
}: CommandListProps) {
	const { t } = useTranslation("shell");
	const scrollSelectedIntoView = useCallback(
		(node: HTMLButtonElement | null) => node?.scrollIntoView({ block: "nearest" }),
		[],
	);
	if (!results.length) {
		return <div className="commandPaletteEmpty">{t("commandPalette.noResults")}</div>;
	}

	let previousKind: PaletteResultKind | null = null;
	return (
		<div aria-label={t("commandPalette.resultsLabel")}>
			<Highlight value={results[selectedIndex]?.id ?? null} className="commandPaletteHighlight">
				{results.map((result, index) => {
					const showGroup = result.kind !== previousKind;
					previousKind = result.kind;
					const selected = index === selectedIndex;
					return (
						<Fragment key={result.id}>
							{showGroup ? (
								<div className="commandPaletteGroupLabel">
									{t(`commandPalette.groups.${result.kind}`)}
								</div>
							) : null}
							<HighlightItem value={result.id}>
								<button
									ref={selected ? scrollSelectedIntoView : undefined}
									id={result.id}
									type="button"
									aria-current={selected}
									aria-pressed={result.checked}
									className="commandPaletteItem commandPaletteUniversalRow"
									data-kind={result.kind}
									data-control={result.settingControl}
									disabled={result.enabled === false}
									onMouseEnter={() => onSetSelectedIndex(index)}
									onMouseDown={(event) => {
										event.preventDefault();
									}}
									onClick={() => onSelectResult(index)}
								>
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
															<span className="commandPaletteResultLineSep" aria-hidden="true">
																·
															</span>
															<span className="commandPaletteResultPath" title={result.description}>
																{result.description}
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
												<span className="commandPaletteResultSnippet">
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
								</button>
							</HighlightItem>
						</Fragment>
					);
				})}
			</Highlight>
		</div>
	);
}
