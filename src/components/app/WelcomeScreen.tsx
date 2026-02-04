import { onWindowDragMouseDown } from "../../utils/window";

interface WelcomeScreenProps {
	appName: string | null;
	recentVaults: string[];
	onOpenVault: () => void;
	onCreateVault: () => void;
	onSelectRecentVault: (path: string) => void;
}

export function WelcomeScreen({
	appName,
	recentVaults,
	onOpenVault,
	onCreateVault,
	onSelectRecentVault,
}: WelcomeScreenProps) {
	return (
		<>
			<div
				className="mainToolbar"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			>
				<div className="mainToolbarLeft">
					<span className="canvasTitle">Welcome</span>
				</div>
			</div>
			<div className="welcomeScreen">
				<div className="welcomeHero">
					<div className="welcomeTitle">{appName ?? "Tether"}</div>
					<div className="welcomeSubtitle">
						Open or create a vault to start building your workspace.
					</div>
				</div>
				<div className="welcomeActions">
					<button type="button" className="primary" onClick={onOpenVault}>
						Open Vault
					</button>
					<button type="button" className="ghost" onClick={onCreateVault}>
						Create Vault
					</button>
				</div>
				<div className="welcomeRecents">
					<div className="welcomeSectionTitle">Recent vaults</div>
					{recentVaults.length ? (
						<div className="welcomeRecentList">
							{recentVaults.map((p) => (
								<button
									key={p}
									type="button"
									className="welcomeRecentItem"
									onClick={() => onSelectRecentVault(p)}
								>
									<span className="welcomeRecentName">
										{p.split("/").pop() ?? p}
									</span>
									<span className="welcomeRecentPath mono">{p}</span>
								</button>
							))}
						</div>
					) : (
						<div className="welcomeEmpty">No recent vaults yet.</div>
					)}
				</div>
			</div>
		</>
	);
}
