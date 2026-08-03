import { X } from "../Icons";

interface ExternalMarkdownStatusBarProps {
	wordCount: number;
	error: string;
	saveStatus: string | null;
	saveState: "loading" | "saving" | "edited" | "saved" | undefined;
	onDismissError: () => void;
}

export function ExternalMarkdownStatusBar({
	wordCount,
	error,
	saveStatus,
	saveState,
	onDismissError,
}: ExternalMarkdownStatusBarProps) {
	return (
		<footer
			className="externalMarkdownStatusBar"
			data-error={error ? "true" : undefined}
		>
			{error ? (
				<>
					<span className="externalMarkdownStatusError">{error}</span>
					<button
						type="button"
						className="externalMarkdownStatusDismiss"
						aria-label="Dismiss error"
						onClick={onDismissError}
					>
						<X size="var(--icon-xs)" aria-hidden="true" />
					</button>
				</>
			) : (
				<>
					<span className="externalMarkdownStatusCounts">
						{wordCount === 1 ? "1 word" : `${wordCount.toLocaleString()} words`}
					</span>
					<span
						className="externalMarkdownSaveStatus"
						data-state={saveState}
						aria-live="polite"
					>
						{saveStatus ?? ""}
					</span>
				</>
			)}
		</footer>
	);
}
