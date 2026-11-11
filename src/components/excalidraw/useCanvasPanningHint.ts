import type { AppState } from "@excalidraw/excalidraw/types";
import { useState } from "react";
import { useSpace } from "../../contexts/SpaceContext";

const PANNING_HINT_SEEN_STORAGE_KEY = "glyph.canvas.panningHintSeenSpaces";

function readSeenSpaces(): string[] {
	try {
		const parsed: unknown = JSON.parse(
			window.localStorage.getItem(PANNING_HINT_SEEN_STORAGE_KEY) ?? "[]",
		);
		return Array.isArray(parsed)
			? parsed.filter((path): path is string => typeof path === "string")
			: [];
	} catch {
		return [];
	}
}

function writeSeenSpace(spacePath: string) {
	try {
		const seen = readSeenSpaces();
		if (seen.includes(spacePath)) return;
		window.localStorage.setItem(
			PANNING_HINT_SEEN_STORAGE_KEY,
			JSON.stringify([...seen, spacePath]),
		);
	} catch {
		// Best-effort UI persistence: the hint shows again next time.
	}
}

/** Mirrors the state in which Excalidraw's HintViewer shows its "To move canvas…" hint. */
function showsPanningHint(appState: AppState): boolean {
	return (
		appState.activeTool.type === "selection" &&
		Object.keys(appState.selectedElementIds).length === 0 &&
		!appState.selectionElement &&
		!appState.editingTextElement &&
		!appState.croppingElementId &&
		appState.searchMatches.length === 0
	);
}

/**
 * Excalidraw's hand-tool hint helps once per space: after the first drawing in a space it is
 * hidden, while its other contextual hints (lines, text, cropping) keep showing.
 */
export function useCanvasPanningHint() {
	const { spacePath } = useSpace();
	const [seen, setSeen] = useState(
		() => spacePath !== null && readSeenSpaces().includes(spacePath),
	);
	const [panningHintShowing, setPanningHintShowing] = useState(true);

	const onSceneChange = (elements: readonly { isDeleted: boolean }[], appState: AppState) => {
		setPanningHintShowing(showsPanningHint(appState));
		if (seen || spacePath === null) return;
		if (elements.some((element) => !element.isDeleted)) {
			writeSeenSpace(spacePath);
			setSeen(true);
		}
	};

	return { panningHintHidden: seen && panningHintShowing, onSceneChange };
}
