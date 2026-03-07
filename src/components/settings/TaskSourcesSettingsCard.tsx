import { useCallback, useEffect, useState } from "react";
import {
	type TaskSourceSetting,
	loadSettings,
	setTaskSource,
} from "../../lib/settings";
import { useTauriEvent } from "../../lib/tauriEvents";
import { DatabaseFolderPicker } from "../database/DatabaseFolderPicker";
import { Button } from "../ui/shadcn/button";
import {
	SettingsRow,
	SettingsSection,
	SettingsSegmented,
} from "./SettingsScaffold";

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
		<SettingsSection
			title="Task Sources"
			description="Choose whether the Tasks pane reads from the whole space or only selected folders."
		>
			{error ? <div className="settingsError">{error}</div> : null}
			<SettingsRow
				label="Scope"
				description="Whole space scans every note. Selected folders keeps the Tasks pane focused."
			>
				<SettingsSegmented<TaskSourceSetting["mode"]>
					ariaLabel="Task source scope"
					value={source.mode}
					disabled={!hasSpace || saving}
					onChange={(value) =>
						void persist({
							mode: value,
							folders: source.folders,
						})
					}
					options={[
						{ label: "Whole space", value: "space" },
						{ label: "Selected folders", value: "folders" },
					]}
				/>
			</SettingsRow>
			{!hasSpace ? (
				<SettingsRow
					label="Availability"
					description="Open a space first to choose which folders feed the Tasks pane."
					stacked
				>
					<div className="settingsEmpty">
						Open a space first to choose which folders feed the Tasks pane.
					</div>
				</SettingsRow>
			) : null}
			{source.mode === "folders" && hasSpace ? (
				<>
					<SettingsRow
						label="Add folder"
						description="Pick a folder to include in the Tasks pane."
						stacked
					>
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
									!draftFolder || source.folders.includes(draftFolder) || saving
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
					</SettingsRow>
					<SettingsRow
						label="Selected folders"
						description="Remove any folder chip to stop pulling tasks from it."
						stacked
					>
						{source.folders.length > 0 ? (
							<div className="settingsTaskSourceChipList">
								{source.folders.map((folder) => (
									<button
										key={folder}
										type="button"
										className="settingsPill settingsTaskSourceChip"
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
										{folderName(folder)}
										<span
											className="settingsTaskSourceChipX"
											aria-hidden="true"
										>
											×
										</span>
									</button>
								))}
							</div>
						) : (
							<div className="settingsEmpty">
								No folders selected yet. Add at least one folder or switch back
								to whole space.
							</div>
						)}
					</SettingsRow>
				</>
			) : null}
			{source.mode === "space" && hasSpace ? (
				<SettingsRow
					label="Coverage"
					description="Glyph will read task items from every eligible note in the current space."
					stacked
				>
					<div className="settingsEmpty">
						All folders in the current space are included.
					</div>
				</SettingsRow>
			) : null}
		</SettingsSection>
	);
}
