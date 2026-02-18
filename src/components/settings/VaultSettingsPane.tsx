import { useCallback, useEffect, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
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
			setError(extractErrorMessage(e));
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	return (
		<div className="settingsPane">
			<h2>Vault</h2>
			{error ? <div className="settingsError">{error}</div> : null}

			<div className="settingsGrid">
				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Current Vault</div>
						</div>
						<div className="settingsPill">Active</div>
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
			</div>
		</div>
	);
}
