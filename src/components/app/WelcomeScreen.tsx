import { motion, stagger, useReducedMotion } from "motion/react";
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
	const reduceMotion = useReducedMotion();
	const smoothEase = [0.22, 1, 0.36, 1] as const;
	const lastVaultName = lastVaultPath?.split("/").pop() ?? null;
	const launchRecents = recentVaults.filter((p) => p !== lastVaultPath).slice(0, 6);
	const containerVariants = {
		hidden: { opacity: 0 },
		show: {
			opacity: 1,
			transition: reduceMotion
				? { duration: 0.01 }
				: { delayChildren: stagger(0.06), duration: 0.22 },
		},
	};
	const itemVariants = {
		hidden: { opacity: 0, y: reduceMotion ? 0 : 8 },
		show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: smoothEase } },
	};

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
				<div className="welcomeAmbient" aria-hidden="true">
					<motion.div
						className="welcomeOrb welcomeOrbA"
						animate={reduceMotion ? { opacity: 0.7 } : { x: [0, 14, 0], y: [0, -10, 0] }}
						transition={{
							duration: 12,
							repeat: Number.POSITIVE_INFINITY,
							ease: smoothEase,
						}}
					/>
					<motion.div
						className="welcomeOrb welcomeOrbB"
						animate={reduceMotion ? { opacity: 0.7 } : { x: [0, -16, 0], y: [0, 12, 0] }}
						transition={{
							duration: 14,
							repeat: Number.POSITIVE_INFINITY,
							ease: smoothEase,
						}}
					/>
				</div>
				<motion.div
					className="welcomeSurface"
					initial="hidden"
					animate="show"
					variants={containerVariants}
				>
					<motion.div className="welcomeHero" variants={itemVariants}>
						<div className="welcomeEyebrow">Workspace launcher</div>
						<div className="welcomeTitle">{appName ?? "Tether"}</div>
						<div className="welcomeSubtitle">
							Pick up where you left off or start a new vault in seconds.
						</div>
					</motion.div>
					<motion.div className="welcomeLaunchPanel" variants={itemVariants}>
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
					<motion.div className="welcomeRecents" variants={itemVariants}>
						<div className="welcomeSectionTitle">Recent vaults</div>
						{launchRecents.length ? (
							<div className="welcomeRecentList">
								{launchRecents.map((p) => (
									<button
										key={p}
										type="button"
										className="welcomeRecentItem"
										onClick={() => void onSelectRecentVault(p)}
									>
										<span className="welcomeRecentName">{p.split("/").pop() ?? p}</span>
										<span className="welcomeRecentPath mono">{p}</span>
									</button>
								))}
							</div>
						) : (
							<div className="welcomeEmpty">
								Open or create a vault to start your recent list.
							</div>
						)}
					</motion.div>
				</motion.div>
			</div>
		</>
	);
}
