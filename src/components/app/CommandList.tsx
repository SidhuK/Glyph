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
}

/** DOM id of a result row, for the combobox's aria-activedescendant. */
export function paletteOptionId(listId: string, index: number) {
	return `${listId}-option-${index}`;
}

/** Consecutive results of one kind form a labelled group. */
function groupResults(results: readonly PaletteResult[]) {
	const groups: { kind: PaletteResultKind; rows: { result: PaletteResult; index: number }[] }[] =
		[];
	results.forEach((result, index) => {
		const last = groups[groups.length - 1];
		if (last?.kind === result.kind) last.rows.push({ result, index });
		else groups.push({ kind: result.kind, rows: [{ result, index }] });
	});
	return groups;
}

export function CommandList({
	id,
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
		return (
			<div id={id} className="commandPaletteEmpty">
				{t("commandPalette.noResults")}
			</div>
		);
	}

	return (
		<div id={id} role="listbox" aria-label={t("commandPalette.resultsLabel")}>
			<Highlight value={results[selectedIndex]?.id ?? null} className="commandPaletteHighlight">
				{groupResults(results).map(({ kind, rows }) => {
					// buildPaletteResults emits each kind as one contiguous group.
					const labelId = `${id}-group-${kind}`;
					return (
						<div key={kind} role="group" aria-labelledby={labelId} className="commandPaletteGroup">
							<div id={labelId} className="commandPaletteGroupLabel">
								{t(`commandPalette.groups.${kind}`)}
							</div>
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
						</div>
					);
				})}
			</Highlight>
		</div>
	);
}
