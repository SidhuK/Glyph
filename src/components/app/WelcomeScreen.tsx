import { motion, stagger, useReducedMotion } from "motion/react";
import { onWindowDragMouseDown } from "../../utils/window";
import { FileText, FolderOpen, FolderPlus, Search } from "../Icons";

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
	const launchRecents = recentVaults
		.filter((p) => p !== lastVaultPath)
		.slice(0, 6);
	const quickStartSteps = [
		{
			icon: FolderOpen,
			title: "Open folder",
			description: "Choose your local vault folder.",
		},
		{
			icon: FileText,
			title: "Browse files",
			description: "Open notes from your folders.",
		},
		{
			icon: Search,
			title: "Find fast",
			description: "Use search and tags to jump back in.",
		},
	] as const;
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
		show: {
			opacity: 1,
			y: 0,
			transition: { duration: 0.28, ease: smoothEase },
		},
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
						animate={
							reduceMotion
								? { opacity: 0.7 }
								: { x: [0, 14, 0], y: [0, -10, 0] }
						}
						transition={{
							duration: 12,
							repeat: Number.POSITIVE_INFINITY,
							ease: smoothEase,
						}}
					/>
					<motion.div
						className="welcomeOrb welcomeOrbB"
						animate={
							reduceMotion
								? { opacity: 0.7 }
								: { x: [0, -16, 0], y: [0, 12, 0] }
						}
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
						<div className="welcomeTitle">{appName ?? "Lattice"}</div>
						<div className="welcomeSubtitle">
							A simple space for notes and canvases.
						</div>
					</motion.div>
					<motion.div className="welcomeOnboarding" variants={itemVariants}>
						<div className="welcomeOnboardingList">
							{quickStartSteps.map((step, index) => (
								<motion.div
									key={step.title}
									className="welcomeOnboardingCard"
									initial={{
										opacity: 0,
										y: reduceMotion ? 0 : 10,
										scale: reduceMotion ? 1 : 0.99,
									}}
									animate={{ opacity: 1, y: 0, scale: 1 }}
									transition={{
										delay: reduceMotion ? 0 : 0.1 + index * 0.06,
										type: "spring",
										stiffness: 360,
										damping: 30,
									}}
									whileHover={
										reduceMotion
											? undefined
											: {
													y: -3,
													scale: 1.01,
													rotate: -0.25 + index * 0.25,
													transition: { duration: 0.18, ease: smoothEase },
												}
									}
								>
									<div className="welcomeOnboardingIndex">0{index + 1}</div>
									<div>
										<div className="welcomeOnboardingTitle">
											<step.icon size={14} strokeWidth={1.8} />
											<span>{step.title}</span>
										</div>
										<div className="welcomeOnboardingBody">
											{step.description}
										</div>
									</div>
								</motion.div>
							))}
						</div>
					</motion.div>
					<motion.div className="welcomeLaunchPanel" variants={itemVariants}>
						<div className="welcomeActions">
							<motion.button
								type="button"
								className="welcomeLaunchPrimary"
								onClick={() => void onContinueLastVault()}
								disabled={!lastVaultPath}
								whileHover={
									reduceMotion
										? undefined
										: {
												y: -2,
												scale: 1.015,
												boxShadow: "0 10px 22px rgba(0,0,0,0.12)",
											}
								}
								whileTap={reduceMotion ? undefined : { y: 0, scale: 0.99 }}
								transition={{ type: "spring", stiffness: 430, damping: 28 }}
							>
								<FolderOpen size={14} strokeWidth={1.8} />
								{lastVaultName ? `Continue ${lastVaultName}` : "Continue"}
							</motion.button>
							<motion.button
								type="button"
								className="welcomeLaunchSecondary"
								onClick={onOpenVault}
								whileHover={reduceMotion ? undefined : { y: -2 }}
								whileTap={reduceMotion ? undefined : { y: 0, scale: 0.99 }}
								transition={{ type: "spring", stiffness: 430, damping: 28 }}
							>
								<FolderOpen size={14} strokeWidth={1.8} />
								Open vault
							</motion.button>
							<motion.button
								type="button"
								className="welcomeLaunchSecondary"
								onClick={onCreateVault}
								whileHover={reduceMotion ? undefined : { y: -2 }}
								whileTap={reduceMotion ? undefined : { y: 0, scale: 0.99 }}
								transition={{ type: "spring", stiffness: 430, damping: 28 }}
							>
								<FolderPlus size={14} strokeWidth={1.8} />
								Create vault
							</motion.button>
						</div>
						{lastVaultPath ? (
							<div className="welcomeLastVault mono">{lastVaultPath}</div>
						) : (
							<div className="welcomeEmpty">
								No previous vault found on this device.
							</div>
						)}
					</motion.div>
					<motion.div className="welcomeRecents" variants={itemVariants}>
						{launchRecents.length ? (
							<div className="welcomeRecentList">
								{launchRecents.map((p, index) => (
									<motion.button
										key={p}
										type="button"
										className="welcomeRecentItem"
										onClick={() => void onSelectRecentVault(p)}
										initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{
											delay: reduceMotion ? 0 : 0.2 + index * 0.04,
											duration: 0.22,
											ease: smoothEase,
										}}
										whileHover={reduceMotion ? undefined : { y: -2, x: 1 }}
										whileTap={reduceMotion ? undefined : { y: 0, scale: 0.99 }}
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
				</motion.div>
			</div>
		</>
	);
}
