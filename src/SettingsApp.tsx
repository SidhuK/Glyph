import "./App.css";
import { Settings as SettingsIcon } from "./components/Icons";
import { AiSettingsPane } from "./components/settings/AiSettingsPane";
import { VaultSettingsPane } from "./components/settings/VaultSettingsPane";

export default function SettingsApp() {
	return (
		<div className="settingsShell">
			<div className="settingsBackdrop" aria-hidden="true" />
			<div className="settingsHeader" data-tauri-drag-region>
				<div className="settingsHeaderRight">
					<div className="settingsHeaderTitle">
						<SettingsIcon size={16} />
						<span>Settings</span>
					</div>
				</div>
			</div>

			<main className="settingsMain" data-window-drag-ignore>
				<VaultSettingsPane />
				<AiSettingsPane />
			</main>
		</div>
	);
}
