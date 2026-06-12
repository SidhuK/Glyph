import { cn } from "../../lib/utils";

type CanvasPaneAwaitVariant = "all-docs" | "databases" | "connections" | "home";

interface CanvasPaneAwaitProps {
	variant: CanvasPaneAwaitVariant;
}

export function CanvasPaneAwait({ variant }: CanvasPaneAwaitProps) {
	return (
		<div
			className={cn(
				"canvasPaneAwait",
				variant === "connections" && "localNoteConnectionsViewport",
			)}
			data-variant={variant}
			aria-busy="true"
			aria-live="polite"
		/>
	);
}
