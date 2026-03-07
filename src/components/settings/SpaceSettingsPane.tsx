import { useCallback, useEffect, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import { clearRecentSpaces, loadSettings } from "../../lib/settings";
import { invoke } from "../../lib/tauri";
import { Button } from "../ui/shadcn/button";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";
import { TaskSourcesSettingsCard } from "./TaskSourcesSettingsCard";

export function SpaceSettingsPane() {
	const [currentSpacePath, setCurrentSpacePath] = useState<string | null>(null);
	const [recentSpaces, setRecentSpaces] = useState<string[]>([]);
	const [error, setError] = useState("");
	const [reindexStatus, setReindexStatus] = useState("");
	const [isIndexing, setIsIndexing] = useState(false);

	const onRebuildIndex = useCallback(async () => {
		if (!currentSpacePath) {
			setReindexStatus("Open a space first to rebuild the index.");
			return;
		}
		setReindexStatus("");
		try {
			setIsIndexing(true);
			await invoke("index_rebuild");
			setReindexStatus("Index rebuild completed.");
		} catch (e) {
			setReindexStatus(extractErrorMessage(e));
		} finally {
			setIsIndexing(false);
		}
	}, [currentSpacePath]);

	const refresh = useCallback(async () => {
		setError("");
		try {
			const s = await loadSettings();
			setCurrentSpacePath(s.currentSpacePath);
			setRecentSpaces(s.recentSpaces);
		} catch (e) {
			setError(extractErrorMessage(e));
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}

			<div className="settingsGrid">
				<SettingsSection
					title="Current Space"
					description="Review the active workspace path currently open in Glyph."
					aside={
						currentSpacePath ? (
							<div className="settingsPill settingsPillOk">Active</div>
						) : (
							<div className="settingsPill settingsPillInfo">Inactive</div>
						)
					}
				>
					<SettingsRow
						label="Path"
						description="Glyph stores notes, indexes, and task configuration relative to this space."
						stacked
					>
						<div className="settingsValue mono">
							{currentSpacePath ?? "(none selected)"}
						</div>
					</SettingsRow>
				</SettingsSection>

				<SettingsSection
					title="Recent Spaces"
					description="See where you’ve worked recently and clear that history when needed."
					aside={
						<Button
							type="button"
							variant="ghost"
							size="xs"
							aria-label="Clear recent spaces"
							onClick={async () => {
								await clearRecentSpaces();
								await refresh();
							}}
						>
							Clear
						</Button>
					}
				>
					{recentSpaces.length > 0 ? (
						<ul className="settingsList">
							{recentSpaces.map((p) => (
								<li key={p} className="mono">
									{p}
								</li>
							))}
						</ul>
					) : (
						<div className="settingsEmpty">No recent spaces.</div>
					)}
				</SettingsSection>

				<SettingsSection
					title="Search Index"
					description="Rebuild the index if search results are incomplete, stale, or missing."
					aside={
						<Button
							type="button"
							size="xs"
							onClick={() => {
								void onRebuildIndex();
							}}
							disabled={!currentSpacePath || isIndexing}
						>
							{isIndexing ? "Rebuilding..." : "Rebuild"}
						</Button>
					}
				>
					<SettingsRow
						label="Status"
						description="Use this when search results look outdated after large note or file changes."
						stacked
					>
						<div className="settingsEmpty">
							{reindexStatus || "Index is ready."}
						</div>
					</SettingsRow>
				</SettingsSection>

				<TaskSourcesSettingsCard currentSpacePath={currentSpacePath} />
			</div>
		</div>
	);
}
