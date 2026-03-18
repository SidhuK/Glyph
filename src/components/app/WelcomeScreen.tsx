import { m, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import { onWindowDragMouseDown } from "../../utils/window";
import {
	Computer,
	FileText,
	FolderClosed,
	FolderOpen,
	FolderPlus,
	Sparkles,
} from "../Icons";
import { springPresets } from "../ui/animations";

interface WelcomeScreenProps {
	appName: string | null;
	lastSpacePath: string | null;
	recentSpaces: string[];
	onOpenSpace: () => void;
	onCreateSpace: () => void;
	onContinueLastSpace: () => void;
	onSelectRecentSpace: (path: string) => Promise<void>;
}

const STAGGER = 0.05;
const BRAND_DELAY = 0.15;

function normalizePathSeparators(fullPath: string): string {
	return fullPath.replace(/\\/g, "/");
}

function shortenPath(fullPath: string): string {
	const normalizedPath = normalizePathSeparators(fullPath);
	const segments = normalizedPath.split("/").filter(Boolean);
	if (segments.length <= 3) return fullPath;
	return `~/${segments.slice(-2).join("/")}`;
}

export function WelcomeScreen({
	appName,
	lastSpacePath,
	recentSpaces,
	onOpenSpace,
	onCreateSpace,
	onContinueLastSpace,
	onSelectRecentSpace,
}: WelcomeScreenProps) {
	const shouldReduceMotion = useReducedMotion();
	const lastSpaceName = lastSpacePath?.length
		? (normalizePathSeparators(lastSpacePath).split("/").pop() ?? lastSpacePath)
		: null;
	const otherRecents = recentSpaces.filter((path) => path !== lastSpacePath);

	const skip = shouldReduceMotion ?? false;
	const spring = skip
		? { type: "tween" as const, duration: 0 }
		: springPresets.gentle;
	const bouncySpring = skip
		? { type: "tween" as const, duration: 0 }
		: springPresets.bouncy;

	const features = useMemo(
		() => [
			{ icon: <Computer size={14} strokeWidth={1.8} />, label: "Local files" },
			{
				icon: <FileText size={14} strokeWidth={1.8} />,
				label: "Markdown notes",
			},
			{ icon: <Sparkles size={14} strokeWidth={1.8} />, label: "Optional AI" },
		],
		[],
	);

	const actionCards = useMemo(() => {
		const cards: Array<{
			key: string;
			primary?: boolean;
			icon: React.ReactNode;
			label: string;
			hint: string;
			onClick: () => void;
		}> = [];

		if (lastSpacePath) {
			cards.push({
				key: "continue",
				primary: true,
				icon: <FolderOpen size={16} strokeWidth={1.8} />,
				label: `Continue ${lastSpaceName}`,
				hint: shortenPath(lastSpacePath),
				onClick: () => void onContinueLastSpace(),
			});
		}

		cards.push(
			{
				key: "open",
				icon: <FolderOpen size={16} strokeWidth={1.8} />,
				label: "Open folder",
				hint: "Work with notes you already have.",
				onClick: onOpenSpace,
			},
			{
				key: "create",
				icon: <FolderPlus size={16} strokeWidth={1.8} />,
				label: "Create space",
				hint: "Start a new folder and keep everything local.",
				onClick: onCreateSpace,
			},
		);

		return cards;
	}, [
		lastSpacePath,
		lastSpaceName,
		onContinueLastSpace,
		onOpenSpace,
		onCreateSpace,
	]);

	return (
		<>
			<div className="mainToolbar" data-tauri-drag-region>
				<div
					aria-hidden="true"
					className="mainToolbarDragLayer"
					data-tauri-drag-region
					onMouseDown={onWindowDragMouseDown}
				/>
				<div className="mainToolbarLeft">
					<span className="canvasTitle">{appName ?? "Glyph"}</span>
				</div>
			</div>
			<m.div
				className="welcomeScreen"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: skip ? 0 : 0.24 }}
			>
				<div className="welcomeSurface">
					<div className="welcomeLauncher">
						<m.section
							className="welcomePanel"
							initial={{ opacity: 0, y: 18 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ ...spring, delay: skip ? 0 : BRAND_DELAY }}
						>
							<div className="welcomeBrandRow">
								<m.img
									src="/glyph-app-icon.png"
									alt=""
									className="welcomeBrandIcon"
									aria-hidden
									initial={{ opacity: 0, scale: 0.5, rotate: -20 }}
									animate={{ opacity: 1, scale: 1, rotate: 0 }}
									transition={{
										...bouncySpring,
										delay: skip ? 0 : BRAND_DELAY + 0.05,
									}}
								/>
								<m.h1
									className="welcomeBrandName"
									initial={{ opacity: 0, x: -8 }}
									animate={{ opacity: 1, x: 0 }}
									transition={{
										...spring,
										delay: skip ? 0 : BRAND_DELAY + 0.12,
									}}
								>
									{appName ?? "Glyph"}
								</m.h1>
							</div>

							<m.p
								className="welcomeSubtitle"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{
									duration: skip ? 0 : 0.28,
									delay: skip ? 0 : BRAND_DELAY + 0.22,
								}}
							>
								Your notes, your files, your machine. Pick a folder and start
								writing.
							</m.p>

							<div className="welcomeActionList">
								{actionCards.map((card, i) => {
									const cardDelay = skip ? 0 : BRAND_DELAY + 0.3 + STAGGER * i;
									return (
										<m.button
											key={card.key}
											type="button"
											className={`welcomeActionButton${card.primary ? " welcomeActionButtonPrimary" : ""}`}
											onClick={card.onClick}
											initial={{ opacity: 0, y: 14, scale: 0.97 }}
											animate={{ opacity: 1, y: 0, scale: 1 }}
											transition={{ ...spring, delay: cardDelay }}
											whileHover={skip ? undefined : { y: -2, scale: 1.01 }}
											whileTap={skip ? undefined : { scale: 0.97 }}
										>
											<m.div
												className="welcomeActionIcon"
												initial={{ opacity: 0, scale: 0.6 }}
												animate={{ opacity: 1, scale: 1 }}
												transition={{
													...bouncySpring,
													delay: skip ? 0 : cardDelay + 0.06,
												}}
											>
												{card.icon}
											</m.div>
											<div className="welcomeActionContent">
												<div className="welcomeActionLabel">
													<span>{card.label}</span>
												</div>
												<div className="welcomeActionHint">{card.hint}</div>
											</div>
										</m.button>
									);
								})}
							</div>

							<m.div
								className="welcomeFeatureRow"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{
									duration: skip ? 0 : 0.3,
									delay: skip
										? 0
										: BRAND_DELAY + 0.3 + STAGGER * actionCards.length + 0.1,
								}}
							>
								{features.map((f, i) => (
									<m.span
										key={f.label}
										className="welcomeFeatureChip"
										initial={{ opacity: 0, y: 6 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{
											...spring,
											delay: skip
												? 0
												: BRAND_DELAY +
													0.3 +
													STAGGER * actionCards.length +
													0.15 +
													STAGGER * i,
										}}
									>
										{f.icon}
										{f.label}
									</m.span>
								))}
							</m.div>
						</m.section>

						<m.section
							className="welcomePanel"
							initial={{ opacity: 0, y: 18 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{
								...spring,
								delay: skip ? 0 : BRAND_DELAY + 0.2,
							}}
						>
							<m.div
								className="welcomeSectionTitle"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{
									duration: skip ? 0 : 0.3,
									delay: skip ? 0 : BRAND_DELAY + 0.35,
								}}
							>
								Recent spaces
							</m.div>
							{otherRecents.length > 0 ? (
								<div className="welcomeRecentList">
									{otherRecents.slice(0, 6).map((path, i) => (
										<m.button
											key={path}
											type="button"
											className="welcomeRecentItem"
											onClick={() => void onSelectRecentSpace(path)}
											initial={{ opacity: 0, x: 10 }}
											animate={{ opacity: 1, x: 0 }}
											transition={{
												...spring,
												delay: skip ? 0 : BRAND_DELAY + 0.4 + STAGGER * i,
											}}
											whileHover={skip ? undefined : { x: 3, scale: 1.01 }}
											whileTap={skip ? undefined : { scale: 0.98 }}
										>
											<span className="welcomeRecentName">
												{normalizePathSeparators(path).split("/").pop() ?? path}
											</span>
											<span className="welcomeRecentPath mono">
												{shortenPath(path)}
											</span>
										</m.button>
									))}
								</div>
							) : (
								<m.div
									className="welcomeEmptyState"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									transition={{
										duration: skip ? 0 : 0.24,
										delay: skip ? 0 : BRAND_DELAY + 0.45,
									}}
								>
									<FolderClosed
										size={20}
										strokeWidth={1.5}
										className="welcomeEmptyIcon"
									/>
									<p className="welcomeEmptyText">
										Spaces you open will appear here.
									</p>
								</m.div>
							)}
						</m.section>
					</div>
				</div>
			</m.div>
		</>
	);
}
