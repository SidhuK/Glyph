import "./App.css";
import { Settings as SettingsIcon } from "./components/Icons";
import { AiSettingsPane } from "./components/settings/AiSettingsPane";
import { DailyNotesSettingsPane } from "./components/settings/DailyNotesSettingsPane";
import { VaultSettingsPane } from "./components/settings/VaultSettingsPane";
import { onWindowDragMouseDown } from "./utils/window";

export default function SettingsApp() {
	return (
		<div className="settingsShell" onMouseDown={onWindowDragMouseDown}>
			<div className="settingsBackdrop" aria-hidden="true" />
			<div
				aria-hidden="true"
				className="settingsDragStrip"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			/>
			<div
				className="settingsHeader"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			>
				<div className="settingsHeaderTitle">
					<SettingsIcon size={16} />
					<span>Settings</span>
				</div>
			</div>

			<main className="settingsMain">
				<VaultSettingsPane />
				<DailyNotesSettingsPane />
				<AiSettingsPane />
			</main>
		</div>
	);
}
