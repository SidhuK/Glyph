import { m, useReducedMotion } from "motion/react";
import { FolderOpen, FolderPlus } from "../../Icons";

interface StepReadyProps {
	lastSpacePath: string | null;
	recentSpaces: string[];
	onOpenSpace: () => void;
	onCreateSpace: () => void;
	onContinueLastSpace: () => void;
	onSelectRecentSpace: (path: string) => Promise<void>;
}

export function StepReady({
	lastSpacePath,
	recentSpaces,
	onOpenSpace,
	onCreateSpace,
	onContinueLastSpace,
	onSelectRecentSpace,
}: StepReadyProps) {
	const reduceMotion = useReducedMotion();
	const lastSpaceName = lastSpacePath?.split("/").pop() ?? null;
	const launchRecents = recentSpaces
		.filter((p) => p !== lastSpacePath)
		.slice(0, 6);

	const hoverEffect = reduceMotion ? undefined : { y: -2, scale: 1.015 };
	const tapEffect = reduceMotion ? undefined : { scale: 0.98 };
	const springTransition = {
		type: "spring" as const,
		stiffness: 430,
		damping: 28,
	};

	return (
		<div className="welcomeStepReady">
			<div className="welcomeStepTitle">Open a space to begin</div>
			<div className="welcomeStepSubtitle">
				A space is just a folder on your computer. Pick one below, or open a new
				one.
			</div>
			<div className="welcomeReadyActions">
				{lastSpacePath && (
					<m.button
						type="button"
						className="welcomeLaunchPrimary"
						onClick={() => void onContinueLastSpace()}
						whileHover={hoverEffect}
						whileTap={tapEffect}
						transition={springTransition}
					>
						<FolderOpen size={14} strokeWidth={1.8} />
						Continue {lastSpaceName}
					</m.button>
				)}
				<m.button
					type="button"
					className="welcomeLaunchSecondary"
					onClick={onOpenSpace}
					whileHover={hoverEffect}
					whileTap={tapEffect}
					transition={springTransition}
				>
					<FolderOpen size={14} strokeWidth={1.8} />
					Open Space
				</m.button>
				<m.button
					type="button"
					className="welcomeLaunchSecondary"
					onClick={onCreateSpace}
					whileHover={hoverEffect}
					whileTap={tapEffect}
					transition={springTransition}
				>
					<FolderPlus size={14} strokeWidth={1.8} />
					Create Space
				</m.button>
			</div>
			{lastSpacePath && (
				<div className="welcomeSpacePath mono">{lastSpacePath}</div>
			)}
			{launchRecents.length > 0 && (
				<div className="welcomeRecents">
					<div className="welcomeRecentList">
						{launchRecents.map((p, index) => (
							<m.button
								key={p}
								type="button"
								className="welcomeRecentItem"
								onClick={() => void onSelectRecentSpace(p)}
								initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{
									delay: reduceMotion ? 0 : 0.05 + index * 0.04,
									duration: 0.22,
								}}
								whileHover={reduceMotion ? undefined : { y: -2, x: 1 }}
								whileTap={reduceMotion ? undefined : { y: 0, scale: 0.99 }}
							>
								<span className="welcomeRecentName">
									{p.split("/").pop() ?? p}
								</span>
								<span className="welcomeRecentPath mono">{p}</span>
							</m.button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
