export type SelectionRibbonPlacement = "above" | "below";

export interface SelectionRibbonPosition {
	top: number;
	left: number;
	placement: SelectionRibbonPlacement;
}

export interface SelectedCodeBlockState {
	top: number;
	controlsLeft: number;
	controlsRight: number;
	previewLeft: number;
	width: number;
	previewTop: number;
	pos: number;
	language: string | null;
	source: string;
}

export interface SelectedTableState {
	rowControlLeft: number;
	rowControlTop: number;
	columnControlLeft: number;
	columnControlTop: number;
}
