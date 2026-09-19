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

export function AppearancePreviewFrame({ mode = "default" }: AppearancePreviewFrameProps) {
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

export function AppearanceLayoutPreview({ layout }: { layout: "default" | "folio" }) {
	return (
		<span className="settingsAppearancePreview" aria-hidden="true">
			<span className="settingsAppearancePreviewPane settingsLayoutPreviewPane">
				<AppearancePreviewChrome />
				<span className="settingsLayoutPreviewWorkspace">
					<span className="settingsLayoutPreviewSidebar">
						<span className="settingsAppearancePreviewLine is-active" />
						<span className="settingsAppearancePreviewLine" />
						<span className="settingsAppearancePreviewLine is-short" />
					</span>
					{layout === "folio" ? (
						<span className="settingsLayoutPreviewNoteList">
							<span className="settingsLayoutPreviewSearch" />
							<span className="settingsLayoutPreviewNote is-active" />
							<span className="settingsLayoutPreviewNote" />
						</span>
					) : null}
					<span className="settingsLayoutPreviewEditor">
						<span className="settingsLayoutPreviewTitle" />
						<span className="settingsAppearancePreviewLine" />
						<span className="settingsAppearancePreviewLine is-short" />
					</span>
				</span>
			</span>
		</span>
	);
}
