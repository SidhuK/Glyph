type SelectionRibbonPlacement = "above" | "below";

export interface SelectionRibbonPosition {
	top: number;
	left: number;
	placement: SelectionRibbonPlacement;
}

export interface SelectedCodeBlockState {
	top: number;
	controlsLeft: number;
	controlsRight: number;
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
