import {
	Folder01Icon,
	TableIcon,
	Tag01Icon,
	UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Fragment, type ReactNode, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
	formatShortcutForPlatform,
	formatShortcutPartsForPlatform,
} from "../../lib/shortcuts/platform";
import { FileText } from "../Icons";
import type { PaletteResult, PaletteResultKind } from "./paletteResults";
import { getPaletteSettingIcon } from "./settingsPaletteIcons";

interface CommandListProps {
	results: PaletteResult[];
	selectedIndex: number;
	onSetSelectedIndex: (index: number) => void;
	onSelectResult: (index: number) => void;
}

function HighlightedSnippet({ snippet }: { snippet: string }) {
	const parts = snippet.split(/([⟦⟧])/);
	const output: ReactNode[] = [];
	let highlighted = false;
	for (const [index, part] of parts.entries()) {
		if (part === "⟦") {
			highlighted = true;
		} else if (part === "⟧") {
			highlighted = false;
		} else if (part) {
			output.push(
				<Fragment key={`${index}:${part.slice(0, 8)}`}>
					{highlighted ? <mark>{part}</mark> : part}
				</Fragment>,
			);
		}
	}
	return <>{output}</>;
}

function ResultIcon({ result }: { result: PaletteResult }) {
	if (result.kind === "command") return result.command?.icon ?? null;
	const icon =
		result.kind === "setting"
			? getPaletteSettingIcon(result.settingId)
			: result.kind === "folder"
				? Folder01Icon
				: result.kind === "tag"
					? Tag01Icon
					: result.kind === "person"
						? UserIcon
						: result.kind === "database"
							? TableIcon
							: null;
	return icon ? (
		<HugeiconsIcon icon={icon} size="var(--icon-md)" strokeWidth={0.9} />
	) : (
		<FileText size="var(--icon-md)" />
	);
}

function Shortcut({ result }: { result: PaletteResult }) {
	const shortcut = result.command?.shortcut;
	if (!shortcut) return null;
	return (
		<span
			className="commandPaletteShortcut"
			aria-label={formatShortcutForPlatform(shortcut)}
		>
			<kbd>
				<span className="commandPaletteShortcutCombo">
					{formatShortcutPartsForPlatform(shortcut).map((part) => (
						<span
							key={`${result.id}-${part}`}
							className="commandPaletteShortcutPart"
						>
							{part}
						</span>
					))}
				</span>
			</kbd>
		</span>
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
		(node: HTMLButtonElement | null) =>
			node?.scrollIntoView({ block: "nearest" }),
		[],
	);
	if (!results.length) {
		return (
			<div className="commandPaletteEmpty">{t("commandPalette.noResults")}</div>
		);
	}

	let previousKind: PaletteResultKind | null = null;
	return (
		<div aria-label={t("commandPalette.resultsLabel")}>
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
						<button
							ref={selected ? scrollSelectedIntoView : undefined}
							id={result.id}
							type="button"
							aria-current={selected}
							aria-pressed={result.checked}
							className="commandPaletteItem commandPaletteUniversalRow"
							data-selected={selected}
							data-kind={result.kind}
							data-control={result.settingControl}
							disabled={result.enabled === false}
							onMouseEnter={() => onSetSelectedIndex(index)}
							onMouseDown={(event) => {
								event.preventDefault();
								onSelectResult(index);
							}}
						>
							<span className="commandPaletteItemMain">
								<span className="commandPaletteItemIcon" aria-hidden="true">
									<ResultIcon result={result} />
								</span>
								<span className="commandPaletteUniversalContent">
									<span className="commandPaletteResultLine">
										<span className="commandPaletteResultTitle">
											{result.label}
										</span>
										{result.description ? (
											<>
												<span
													className="commandPaletteResultLineSep"
													aria-hidden="true"
												>
													·
												</span>
												<span
													className="commandPaletteResultPath"
													title={result.description}
												>
													{result.description}
												</span>
											</>
										) : null}
									</span>
									{result.snippet ? (
										<span className="commandPaletteResultSnippet">
											<HighlightedSnippet snippet={result.snippet} />
										</span>
									) : null}
								</span>
							</span>
							{typeof result.checked === "boolean" ? (
								<span className="commandPaletteInlineSettingValue">
									<span>{result.trailing}</span>
									<span
										className="commandPaletteInlineToggle"
										data-checked={result.checked}
										aria-hidden="true"
									>
										<span />
									</span>
								</span>
							) : result.settingControl === "choice" && result.trailing ? (
								<span className="commandPaletteInlineSettingValue">
									<span aria-hidden="true">‹</span>
									<span
										className="commandPaletteResultValue"
										title={result.trailing}
									>
										{result.trailing}
									</span>
									<span aria-hidden="true">›</span>
								</span>
							) : result.trailing ? (
								<span
									className="commandPaletteResultValue"
									title={result.trailing}
								>
									{result.trailing}
								</span>
							) : (
								<Shortcut result={result} />
							)}
						</button>
					</Fragment>
				);
			})}
		</div>
	);
}
