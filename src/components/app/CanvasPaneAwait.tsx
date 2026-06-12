import { cn } from "../../lib/utils";

export type CanvasPaneAwaitVariant =
	| "all-docs"
	| "databases"
	| "graph"
	| "home";

interface CanvasPaneAwaitProps {
	variant: CanvasPaneAwaitVariant;
}

export function CanvasPaneAwait({ variant }: CanvasPaneAwaitProps) {
	return (
		<div
			className={cn(
				"canvasPaneAwait",
				variant === "graph" && "localNoteGraphViewport",
			)}
			data-variant={variant}
			aria-busy="true"
			aria-live="polite"
		/>
	);
}
