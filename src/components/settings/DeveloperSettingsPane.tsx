import { DiagnosticsSection } from "./DiagnosticsSection";

export function DeveloperSettingsPane() {
	return (
		<div className="settingsPane">
			<div className="settingsGrid">
				<DiagnosticsSection />
			</div>
		</div>
	);
}
