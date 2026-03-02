import { useCallback, useEffect, useState } from "react";
import {
	type TaskSourceSetting,
	loadSettings,
	setTaskSource,
} from "../../lib/settings";
import { useTauriEvent } from "../../lib/tauriEvents";
import { DatabaseFolderPicker } from "../database/DatabaseFolderPicker";
import { Button } from "../ui/shadcn/button";

interface TaskSourcesSettingsCardProps {
	currentSpacePath: string | null;
}

const EMPTY_SOURCE: TaskSourceSetting = {
	mode: "space",
	folders: [],
};

function folderName(path: string): string {
	const parts = path.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? path;
}

export function TaskSourcesSettingsCard({
	currentSpacePath,
}: TaskSourcesSettingsCardProps) {
	const [source, setSourceState] = useState<TaskSourceSetting>(EMPTY_SOURCE);
	const [draftFolder, setDraftFolder] = useState("");
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);

	const refresh = useCallback(async () => {
		setError("");
		try {
			const settings = await loadSettings();
			setSourceState(settings.tasks.source);
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Failed to load task scope",
			);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	useTauriEvent("settings:updated", (payload) => {
		if (!payload.tasks?.source) return;
		setSourceState({
			mode: payload.tasks.source.mode === "folders" ? "folders" : "space",
			folders: payload.tasks.source.folders ?? [],
		});
	});

	const persist = useCallback(
		async (next: TaskSourceSetting) => {
			const previous = source;
			setError("");
			setSaving(true);
			setSourceState(next);
			try {
				await setTaskSource(next);
			} catch (cause) {
				setSourceState(previous);
				setError(
					cause instanceof Error ? cause.message : "Failed to save task scope",
				);
			} finally {
				setSaving(false);
			}
		},
		[source],
	);

	const hasSpace = Boolean(currentSpacePath);

	return (
		<section className="settingsCard settingsSpan">
			<div className="settingsCardHeader">
				<div>
					<div className="settingsCardTitle">Task Sources</div>
					<div className="settingsCardHint">
						Choose whether tasks come from your whole space or only selected
						folders.
					</div>
				</div>
				<div className="settingsPill settingsPillInfo">All task views</div>
			</div>
			{error ? <div className="settingsError">{error}</div> : null}
			{!hasSpace ? (
				<div className="settingsEmpty">
					Open a space first to choose which folders feed the Tasks pane.
				</div>
			) : null}
			<div className="settingsTaskSourceBlock">
					<div className="settingsField">
						<div>
							<div className="settingsLabel">Scope</div>
							<div className="settingsHelp">This applies everywhere in Tasks.</div>
						</div>
					<select
						value={source.mode}
						disabled={!hasSpace || saving}
						onChange={(event) =>
							void persist({
								mode: event.target.value === "folders" ? "folders" : "space",
								folders: source.folders,
							})
						}
					>
						<option value="space">Whole space</option>
						<option value="folders">Selected folders</option>
					</select>
				</div>
				{source.mode === "folders" ? (
					<div className="settingsTaskSourceFolders">
						<div className="settingsField settingsTaskSourcePickerRow">
							<div>
								<div className="settingsLabel">Included Folders</div>
								<div className="settingsHelp">
									Only tasks in these folders will show up.
								</div>
							</div>
							<div className="settingsTaskSourcePicker">
								<DatabaseFolderPicker
									value={draftFolder}
									label="Task Folder"
									description="Pick a folder to include in the Tasks pane."
									placeholder="Choose a folder"
									onChange={setDraftFolder}
								/>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={
										!draftFolder ||
										source.folders.includes(draftFolder) ||
										saving
									}
									onClick={() => {
										const next = [...source.folders, draftFolder].sort((a, b) =>
											a.localeCompare(b),
										);
										void persist({ mode: "folders", folders: next });
										setDraftFolder("");
									}}
								>
									Add folder
								</Button>
							</div>
						</div>
						{source.folders.length > 0 ? (
							<div className="settingsTaskSourceChipList">
								{source.folders.map((folder) => (
									<button
										key={folder}
										type="button"
										className="settingsTaskSourceChip"
										disabled={saving}
										onClick={() =>
											void persist({
												mode: "folders",
												folders: source.folders.filter(
													(entry) => entry !== folder,
												),
											})
										}
										title={`Remove ${folder}`}
									>
										<span className="settingsTaskSourceChipLabel">
											{folderName(folder)}
										</span>
										<span className="settingsTaskSourceChipMeta">{folder}</span>
									</button>
								))}
							</div>
						) : (
							<div className="settingsEmpty">
								No folders selected yet. Add at least one folder or switch back
								to whole space.
							</div>
						)}
					</div>
				) : null}
			</div>
		</section>
	);
}
