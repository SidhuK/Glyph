import { useCallback, useEffect, useState } from "react";
import { clearRecentVaults, loadSettings } from "../../lib/settings";

export function VaultSettingsPane() {
	const [currentVaultPath, setCurrentVaultPath] = useState<string | null>(null);
	const [recentVaults, setRecentVaults] = useState<string[]>([]);
	const [error, setError] = useState("");

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
			<h2>Vault</h2>
			{error ? <div className="settingsError">{error}</div> : null}

			<div className="settingsRow">
				<div className="settingsLabel">Current vault</div>
				<div className="settingsValue mono">
					{currentVaultPath ?? "(none selected)"}
				</div>
			</div>

			<div className="settingsSection">
				<div className="settingsSectionHeader">
					<div className="settingsSectionTitle">Recent vaults</div>
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
			</div>
		</div>
	);
}
