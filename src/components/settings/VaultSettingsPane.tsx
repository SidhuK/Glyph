import { useCallback, useEffect, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import { clearRecentVaults, loadSettings } from "../../lib/settings";
import { invoke } from "../../lib/tauri";

export function VaultSettingsPane() {
	const [currentVaultPath, setCurrentVaultPath] = useState<string | null>(null);
	const [recentVaults, setRecentVaults] = useState<string[]>([]);
	const [error, setError] = useState("");
	const [reindexStatus, setReindexStatus] = useState("");
	const [isIndexing, setIsIndexing] = useState(false);

	const onRebuildIndex = useCallback(async () => {
		if (!currentVaultPath) {
			setReindexStatus("Open a vault first to rebuild the index.");
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
	}, [currentVaultPath]);

	const refresh = useCallback(async () => {
		setError("");
		try {
			const s = await loadSettings();
			setCurrentVaultPath(s.currentVaultPath);
			setRecentVaults(s.recentVaults);
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
							<div className="settingsCardTitle">Current Vault</div>
							<div className="settingsCardHint">
								The vault currently open in this window.
							</div>
						</div>
						<div className="settingsPill settingsPillOk">Active</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">Path</div>
						</div>
						<div className="settingsValue mono">
							{currentVaultPath ?? "(none selected)"}
						</div>
					</div>
				</section>

				<section className="settingsCard settingsSpan">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Recent Vaults</div>
							<div className="settingsCardHint">
								Recently opened vaults on this Mac.
							</div>
						</div>
						<button
							type="button"
							aria-label="Clear recent vaults"
							onClick={async () => {
								await clearRecentVaults();
								await refresh();
							}}
						>
							Clear
						</button>
					</div>
					{recentVaults.length ? (
						<ul className="settingsList">
							{recentVaults.map((p) => (
								<li key={p} className="mono">
									{p}
								</li>
							))}
						</ul>
					) : (
						<div className="settingsEmpty">No recent vaults.</div>
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
							disabled={!currentVaultPath || isIndexing}
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
