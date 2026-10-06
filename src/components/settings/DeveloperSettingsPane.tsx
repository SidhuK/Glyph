import { AttachmentBrowser } from "./attachments/AttachmentBrowser";

export function DeveloperSettingsPane() {
	return (
		<div className="settingsPane">
			<div className="settingsGrid">
				<AttachmentBrowser />
			</div>
		</div>
	);
}
