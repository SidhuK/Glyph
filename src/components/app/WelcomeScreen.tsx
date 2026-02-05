import { motion } from "motion/react";
import { onWindowDragMouseDown } from "../../utils/window";

interface WelcomeScreenProps {
	appName: string | null;
	lastVaultPath: string | null;
	recentVaults: string[];
	onOpenVault: () => void;
	onCreateVault: () => void;
	onContinueLastVault: () => void;
	onSelectRecentVault: (path: string) => Promise<void>;
}

export function WelcomeScreen({
	appName,
	lastVaultPath,
	recentVaults,
	onOpenVault,
	onCreateVault,
	onContinueLastVault,
	onSelectRecentVault,
}: WelcomeScreenProps) {
	const lastVaultName = lastVaultPath?.split("/").pop() ?? null;
	const launchRecents = recentVaults.filter((p) => p !== lastVaultPath).slice(0, 6);

	return (
		<>
			<div
				className="mainToolbar"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			>
				<div className="mainToolbarLeft">
					<span className="canvasTitle">Launch</span>
				</div>
			</div>
			<div className="welcomeScreen">
				<motion.div
					className="welcomeHero"
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.28, ease: "easeOut" }}
				>
					<div className="welcomeTitle">{appName ?? "Tether"}</div>
					<div className="welcomeSubtitle">
						Start from your last vault, pick another workspace, or create a
						fresh vault.
					</div>
				</motion.div>

				<motion.div
					className="welcomeLaunchPanel"
					initial={{ opacity: 0, y: 14 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.3, ease: "easeOut", delay: 0.05 }}
				>
					<div className="welcomeSectionTitle">Get started</div>
					<div className="welcomeActions">
						<button
							type="button"
							className="primary"
							onClick={() => void onContinueLastVault()}
							disabled={!lastVaultPath}
						>
							{lastVaultName ? `Continue ${lastVaultName}` : "Continue last vault"}
						</button>
						<button type="button" className="ghost" onClick={onOpenVault}>
							Open another vault
						</button>
						<button type="button" className="ghost" onClick={onCreateVault}>
							Create vault
						</button>
					</div>
					{lastVaultPath ? (
						<div className="welcomeLastVault mono">{lastVaultPath}</div>
					) : (
						<div className="welcomeEmpty">No previous vault found on this device.</div>
					)}
				</motion.div>

				<motion.div
					className="welcomeRecents"
					initial={{ opacity: 0, y: 14 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.3, ease: "easeOut", delay: 0.1 }}
				>
					<div className="welcomeSectionTitle">Recent vaults</div>
					{launchRecents.length ? (
						<div className="welcomeRecentList">
							{launchRecents.map((p, index) => (
								<motion.button
									key={p}
									type="button"
									className="welcomeRecentItem"
									onClick={() => void onSelectRecentVault(p)}
									initial={{ opacity: 0, x: -8 }}
									animate={{ opacity: 1, x: 0 }}
									transition={{
										duration: 0.22,
										ease: "easeOut",
										delay: 0.12 + index * 0.02,
									}}
								>
									<span className="welcomeRecentName">
										{p.split("/").pop() ?? p}
									</span>
									<span className="welcomeRecentPath mono">{p}</span>
								</motion.button>
							))}
						</div>
					) : (
						<div className="welcomeEmpty">
							Open or create a vault to start your recent list.
						</div>
					)}
				</motion.div>
				<div className="welcomeActionsMobile">
					<button type="button" className="primary" onClick={onOpenVault}>
						Open vault
					</button>
					<button type="button" className="ghost" onClick={onCreateVault}>
						Create vault
					</button>
				</div>
			</div>
		</>
	);
}
