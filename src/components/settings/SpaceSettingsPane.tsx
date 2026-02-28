import { useCallback, useEffect, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import { clearRecentSpaces, loadSettings } from "../../lib/settings";
import { invoke } from "../../lib/tauri";

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
				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Current Space</div>
							<div className="settingsCardHint">
								The space currently open in this window.
							</div>
						</div>
						<div className="settingsPill settingsPillOk">Active</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">Path</div>
						</div>
						<div className="settingsValue mono">
							{currentSpacePath ?? "(none selected)"}
						</div>
					</div>
				</section>

				<section className="settingsCard settingsSpan">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Recent Spaces</div>
							<div className="settingsCardHint">
								Recently opened spaces on this Mac.
							</div>
						</div>
						<button
							type="button"
							aria-label="Clear recent spaces"
							onClick={async () => {
								await clearRecentSpaces();
								await refresh();
							}}
						>
							Clear
						</button>
					</div>
					{recentSpaces.length ? (
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
				</section>

				<section className="settingsCard settingsSpan">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Search Index</div>
							<div className="settingsCardHint">
								Rebuild if search results are incomplete or outdated.
							</div>
						</div>
						<button
							type="button"
							onClick={() => {
								void onRebuildIndex();
							}}
							disabled={!currentSpacePath || isIndexing}
						>
							{isIndexing ? "Rebuilding..." : "Rebuild Index"}
						</button>
					</div>
					<div className="settingsEmpty">
						Use this when search results look stale or missing.
					</div>
					{reindexStatus ? (
						<div className="settingsEmpty">{reindexStatus}</div>
					) : null}
				</section>
			</div>
		</div>
	);
}
