import { cn } from "@/lib/utils";

interface AppearancePreviewFrameProps {
	mode?: "default" | "light" | "dark" | "system";
}

function AppearancePreviewChrome() {
	return (
		<span className="settingsAppearancePreviewChrome">
			<span className="settingsAppearancePreviewDot" />
			<span className="settingsAppearancePreviewDot" />
			<span className="settingsAppearancePreviewDot" />
		</span>
	);
}

function AppearancePreviewBody() {
	return (
		<span className="settingsAppearancePreviewBody">
			<span className="settingsAppearancePreviewLine" />
			<span className="settingsAppearancePreviewLine is-short" />
			<span className="settingsAppearancePreviewButton" />
		</span>
	);
}

function AppearancePreviewPane({
	mode,
}: {
	mode: Exclude<AppearancePreviewFrameProps["mode"], "system">;
}) {
	return (
		<span
			className={cn(
				"settingsAppearancePreviewPane",
				mode === "light" && "is-light",
				mode === "dark" && "is-dark",
			)}
		>
			<AppearancePreviewChrome />
			<AppearancePreviewBody />
		</span>
	);
}

export function AppearancePreviewFrame({
	mode = "default",
}: AppearancePreviewFrameProps) {
	if (mode === "system") {
		return (
			<span className="settingsAppearancePreview" aria-hidden="true">
				<span className="settingsAppearancePreviewFrame is-system">
					<AppearancePreviewPane mode="light" />
					<AppearancePreviewPane mode="dark" />
				</span>
			</span>
		);
	}

	return (
		<span className="settingsAppearancePreview" aria-hidden="true">
			<AppearancePreviewPane mode={mode} />
		</span>
	);
}
