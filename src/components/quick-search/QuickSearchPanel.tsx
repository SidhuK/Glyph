import { useMutation } from "@tanstack/react-query";
import { type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../lib/errorUtils";
import { invoke, type QuickSearchTarget } from "../../lib/tauri";
import { CommandList } from "../app/CommandList";
import { buildSearchQuery, movePaletteSelection } from "../app/commandPaletteHelpers";
import type { PaletteResult } from "../app/paletteResults";
import { useQuickSearchResults } from "./useQuickSearchResults";

const RESULTS_ID = "quick-search-results";

function resolveSelectedIndex(results: readonly PaletteResult[], selectedId: string | null) {
	const preserved = selectedId ? results.findIndex((result) => result.id === selectedId) : -1;
	if (preserved >= 0) return preserved;
	const firstId = movePaletteSelection(results, null, 1);
	return Math.max(
		results.findIndex((result) => result.id === firstId),
		0,
	);
}

function targetForResult(result: PaletteResult): QuickSearchTarget | null {
	if (!result.target) return null;
	if (result.kind === "note" || result.kind === "content") {
		return { kind: "note", path: result.target };
	}
	if (result.kind === "database") return { kind: "collection", id: result.target };
	return null;
}

function focusInput(node: HTMLInputElement | null) {
	node?.focus();
}

export function QuickSearchPanel({ spacePath }: { spacePath: string }) {
	const { t } = useTranslation("shell");
	const [query, setQuery] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const { results, isSearching, error } = useQuickSearchResults(query, spacePath);
	const openTarget = useMutation({
		mutationFn: (target: QuickSearchTarget) => invoke("quick_search_open_in_main", { target }),
	});
	const selectedIndex = resolveSelectedIndex(results, selectedId);
	const selectedResult = results[selectedIndex];
	const alert = openTarget.error
		? t("quickSearch.openFailed", { message: extractErrorMessage(openTarget.error) })
		: error
			? extractErrorMessage(error)
			: null;

	const changeQuery = (next: string) => {
		setQuery(next);
		setSelectedId(null);
		openTarget.reset();
	};

	const selectResult = (index: number) => {
		const result = results[index];
		if (!result) return;
		if (result.kind === "tag" && result.target) {
			changeQuery(
				buildSearchQuery({ tags: [result.target], people: [], title_only: false, tag_only: false }),
			);
			return;
		}
		const target = targetForResult(result);
		if (target) openTarget.mutate(target);
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			setSelectedId(
				movePaletteSelection(
					results,
					selectedResult?.id ?? null,
					event.key === "ArrowDown" ? 1 : -1,
				),
			);
		} else if (event.key === "Enter") {
			event.preventDefault();
			selectResult(selectedIndex);
		}
	};

	return (
		<>
			<div className="commandPaletteHeader">
				<div className="commandPaletteInputWrapper">
					<input
						ref={focusInput}
						className="commandPaletteInput"
						role="combobox"
						aria-label={t("quickSearch.title")}
						aria-controls={RESULTS_ID}
						aria-expanded="true"
						aria-activedescendant={selectedResult?.id}
						placeholder={t("quickSearch.placeholder")}
						value={query}
						onChange={(event) => changeQuery(event.target.value)}
						onKeyDown={handleKeyDown}
						autoCorrect="off"
						autoCapitalize="off"
						spellCheck={false}
					/>
				</div>
				{alert ? <p role="alert">{alert}</p> : null}
			</div>
			<div className="commandPaletteBody">
				<div id={RESULTS_ID} className="commandPaletteList">
					{query.trim() ? (
						<output className="sr-only" aria-live="polite">
							{isSearching
								? t("commandPalette.searching")
								: t("commandPalette.results", { count: results.length })}
						</output>
					) : null}
					<CommandList
						results={results}
						selectedIndex={selectedIndex}
						onSetSelectedIndex={(index) => setSelectedId(results[index]?.id ?? null)}
						onSelectResult={selectResult}
					/>
				</div>
			</div>
		</>
	);
}
