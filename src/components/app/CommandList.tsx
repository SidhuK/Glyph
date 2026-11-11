import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Highlight, HighlightItem } from "../ui/shadcn/highlight";
import { CommandListRowContent } from "./CommandListRow";
import type { PaletteResult, PaletteResultKind } from "./paletteResults";

interface CommandListProps {
	/** DOM id of the listbox; the combobox input points at it with aria-controls. */
	id: string;
	results: PaletteResult[];
	selectedIndex: number;
	onSetSelectedIndex: (index: number) => void;
	onSelectResult: (index: number) => void;
	/** Explains an empty search; shown under any no-results action rows. */
	emptyHint: string;
}

/** DOM id of a result row, for the combobox's aria-activedescendant. */
export function paletteOptionId(listId: string, index: number) {
	return `${listId}-option-${index}`;
}

interface ResultGroup {
	key: string;
	kind: PaletteResultKind;
	label?: string;
	rows: { result: PaletteResult; index: number }[];
}

/** Consecutive results of one kind (or one named group within it) form a labelled group. */
function groupResults(results: readonly PaletteResult[]) {
	const groups: ResultGroup[] = [];
	results.forEach((result, index) => {
		const key = `${result.kind}:${result.group ?? ""}`;
		const last = groups[groups.length - 1];
		if (last?.key === key) last.rows.push({ result, index });
		else groups.push({ key, kind: result.kind, label: result.group, rows: [{ result, index }] });
	});
	return groups;
}

export function CommandList({
	id,
	results,
	selectedIndex,
	onSetSelectedIndex,
	onSelectResult,
	emptyHint,
}: CommandListProps) {
	const { t } = useTranslation("shell");
	const scrollSelectedIntoView = useCallback(
		(node: HTMLButtonElement | null) => node?.scrollIntoView({ block: "nearest" }),
		[],
	);
	if (!results.length) {
		return (
			<div id={id} className="commandPaletteEmpty">
				{emptyHint}
			</div>
		);
	}

	return (
		<div id={id} role="listbox" aria-label={t("commandPalette.resultsLabel")}>
			<Highlight value={results[selectedIndex]?.id ?? null} className="commandPaletteHighlight">
				{groupResults(results).map(({ key, kind, label, rows }, groupIndex) => {
					// buildPaletteResults emits each group contiguously.
					const labelId = `${id}-group-${groupIndex}`;
					// No-results actions stand alone, with the hint below instead of a header.
					const isAction = kind === "action";
					return (
						<div
							key={key}
							role="group"
							aria-labelledby={isAction ? undefined : labelId}
							aria-label={isAction ? emptyHint : undefined}
							className="commandPaletteGroup"
						>
							{isAction ? null : (
								<div id={labelId} className="commandPaletteGroupLabel">
									{label ?? t(`commandPalette.groups.${kind}`)}
								</div>
							)}
							{rows.map(({ result, index }) => {
								const selected = index === selectedIndex;
								return (
									<HighlightItem key={result.id} value={result.id}>
										<button
											ref={selected ? scrollSelectedIntoView : undefined}
											id={paletteOptionId(id, index)}
											type="button"
											role="option"
											tabIndex={-1}
											aria-selected={selected}
											aria-checked={result.checked}
											className="commandPaletteItem commandPaletteUniversalRow"
											data-kind={result.kind}
											data-control={result.settingControl}
											disabled={result.enabled === false}
											// Pointer movement only: rows scrolled under a resting pointer by ↑/↓
											// must not take the selection back.
											onPointerMove={() => {
												if (!selected) onSetSelectedIndex(index);
											}}
											onMouseDown={(event) => {
												event.preventDefault();
											}}
											onClick={() => onSelectResult(index)}
										>
											<CommandListRowContent result={result} />
										</button>
									</HighlightItem>
								);
							})}
							{isAction ? <p className="commandPaletteEmptyHint">{emptyHint}</p> : null}
						</div>
					);
				})}
			</Highlight>
		</div>
	);
}
