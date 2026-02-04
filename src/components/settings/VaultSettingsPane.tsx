import { useCallback, useEffect, useState } from "react";
import { clearRecentVaults, loadSettings } from "../../lib/settings";

export function VaultSettingsPane() {
	const [currentVaultPath, setCurrentVaultPath] = useState<string | null>(null);
	const [recentVaults, setRecentVaults] = useState<string[]>([]);
	const [error, setError] = useState("");
	const [indexingMode, setIndexingMode] = useState("auto");
	const [watchExternal, setWatchExternal] = useState(true);
	const [autoCompact, setAutoCompact] = useState(true);
	const [backupFrequency, setBackupFrequency] = useState("weekly");
	const [trashRetention, setTrashRetention] = useState("30");
	const [assetDedupe, setAssetDedupe] = useState(true);

	const refresh = useCallback(async () => {
		setError("");
		try {
			const s = await loadSettings();
			setCurrentVaultPath(s.currentVaultPath);
			setRecentVaults(s.recentVaults);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	return (
		<div className="settingsPane">
			<div className="settingsHero">
				<div>
					<h2>Vault</h2>
					<p className="settingsHint">
						Control storage, indexing, and how your vault is managed locally.
					</p>
				</div>
				<div className="settingsBadge">Filesystem</div>
			</div>
			{error ? <div className="settingsError">{error}</div> : null}

			<div className="settingsGrid">
				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Current Vault</div>
							<div className="settingsCardHint">Active vault location.</div>
						</div>
						<div className="settingsPill">Active</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">Path</div>
							<div className="settingsHelp">Vault root on disk.</div>
						</div>
						<div className="settingsValue mono">
							{currentVaultPath ?? "(none selected)"}
						</div>
					</div>
				</section>

				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Indexing</div>
							<div className="settingsCardHint">
								Search, backlinks, and previews.
							</div>
						</div>
						<div className="settingsBadgeWarn">Under construction</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabelRow">
								<div className="settingsLabel">Mode</div>
								<span className="settingsBadgeWarn">Under construction</span>
							</div>
							<div className="settingsHelp">
								Choose when indexing runs.
							</div>
						</div>
						<select
							value={indexingMode}
							onChange={(e) => setIndexingMode(e.target.value)}
						>
							<option value="auto">Auto</option>
							<option value="optimized">Optimized</option>
							<option value="manual">Manual</option>
						</select>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabelRow">
								<div className="settingsLabel">Watch changes</div>
								<span className="settingsBadgeWarn">Under construction</span>
							</div>
							<div className="settingsHelp">Detect external edits.</div>
						</div>
						<label className="settingsToggle">
							<input
								type="checkbox"
								checked={watchExternal}
								onChange={() => setWatchExternal((prev) => !prev)}
							/>
							<span />
						</label>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabelRow">
								<div className="settingsLabel">Auto-compact</div>
								<span className="settingsBadgeWarn">Under construction</span>
							</div>
							<div className="settingsHelp">Keep SQLite lean.</div>
						</div>
						<label className="settingsToggle">
							<input
								type="checkbox"
								checked={autoCompact}
								onChange={() => setAutoCompact((prev) => !prev)}
							/>
							<span />
						</label>
					</div>
				</section>

				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Attachments</div>
							<div className="settingsCardHint">Asset storage rules.</div>
						</div>
						<div className="settingsBadgeWarn">Under construction</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabelRow">
								<div className="settingsLabel">Deduplicate</div>
								<span className="settingsBadgeWarn">Under construction</span>
							</div>
							<div className="settingsHelp">Reuse identical files.</div>
						</div>
						<label className="settingsToggle">
							<input
								type="checkbox"
								checked={assetDedupe}
								onChange={() => setAssetDedupe((prev) => !prev)}
							/>
							<span />
						</label>
					</div>
				</section>

				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Backups</div>
							<div className="settingsCardHint">Vault snapshots.</div>
						</div>
						<div className="settingsBadgeWarn">Under construction</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabelRow">
								<div className="settingsLabel">Frequency</div>
								<span className="settingsBadgeWarn">Under construction</span>
							</div>
							<div className="settingsHelp">How often to snapshot.</div>
						</div>
						<select
							value={backupFrequency}
							onChange={(e) => setBackupFrequency(e.target.value)}
						>
							<option value="daily">Daily</option>
							<option value="weekly">Weekly</option>
							<option value="manual">Manual</option>
						</select>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabelRow">
								<div className="settingsLabel">Trash retention</div>
								<span className="settingsBadgeWarn">Under construction</span>
							</div>
							<div className="settingsHelp">Days to keep deleted notes.</div>
						</div>
						<select
							value={trashRetention}
							onChange={(e) => setTrashRetention(e.target.value)}
						>
							<option value="7">7 days</option>
							<option value="30">30 days</option>
							<option value="90">90 days</option>
							<option value="forever">Forever</option>
						</select>
					</div>
				</section>

				<section className="settingsCard settingsSpan">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Recent Vaults</div>
							<div className="settingsCardHint">Quickly reopen vaults.</div>
						</div>
						<button
							type="button"
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
			</div>
		</div>
	);
}
