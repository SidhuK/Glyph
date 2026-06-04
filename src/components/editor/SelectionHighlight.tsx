import { useSelectionHighlight } from "./useSelectionHighlight";

interface SelectionHighlightProps {
	host: HTMLElement | null;
	enabled: boolean;
}

export function SelectionHighlight({ host, enabled }: SelectionHighlightProps) {
	useSelectionHighlight({ host, enabled });

	return null;
}
