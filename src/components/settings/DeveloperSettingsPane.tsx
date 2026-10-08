import { DiagnosticsSection } from "./DiagnosticsSection";
import { AttachmentBrowser } from "./attachments/AttachmentBrowser";

export function DeveloperSettingsPane() {
	return (
		<div className="settingsPane">
			<div className="settingsGrid">
				<DiagnosticsSection />
				<AttachmentBrowser />
			</div>
		</div>
	);
}
