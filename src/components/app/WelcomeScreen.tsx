import { m, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { Computer, FileText, FolderOpen, FolderPlus, Sparkles } from "../Icons";
import { springPresets } from "../ui/animations";

interface WelcomeScreenProps {
	appName: string | null;
	lastSpacePath: string | null;
	recentSpaces: string[];
	onOpenSpace: () => void;
	onCreateSpace: () => void;
	onContinueLastSpace: () => void;
	onSelectRecentSpace: (path: string) => void;
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

	const skip = shouldReduceMotion ?? false;
	const spring = skip
		? { type: "tween" as const, duration: 0 }
		: springPresets.gentle;
	const bouncySpring = skip
		? { type: "tween" as const, duration: 0 }
		: springPresets.bouncy;

	const features = useMemo(
		() => [
			{
				icon: <Computer size={14} />,
				label: "Local files",
				desc: "Your notes live as plain files on your computer. No vendor lock-in, just folders you own.",
			},
			{
				icon: <FileText size={14} />,
				label: "Markdown-first",
				desc: "A calm editor with slash commands, live preview, and helpful formatting tools. Every note is a plain .md file you keep and control.",
			},
			{
				icon: <Sparkles size={14} />,
				label: "Optional AI",
				desc: "Summarize, draft, and ask questions using your notes as context. Works with your ChatGPT account, OpenAI, Anthropic, Openrouter or local models via Ollama.",
			},
		],
		[],
	);
	const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);
	const [focusedFeature, setFocusedFeature] = useState<number | null>(null);
	const activeFeature = focusedFeature ?? hoveredFeature;

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
				icon: <FolderOpen size={16} />,
				label: `Continue ${lastSpaceName}`,
				hint: shortenPath(lastSpacePath),
				onClick: () => void onContinueLastSpace(),
			});
		}

		const nextRecent = recentSpaces.find((s) => s !== lastSpacePath);
		if (nextRecent) {
			const name =
				normalizePathSeparators(nextRecent).split("/").pop() ?? nextRecent;
			cards.push({
				key: `recent-${nextRecent}`,
				icon: <FolderOpen size={16} />,
				label: name,
				hint: shortenPath(nextRecent),
				onClick: () => onSelectRecentSpace(nextRecent),
			});
		}

		cards.push(
			{
				key: "open",
				icon: <FolderOpen size={16} />,
				label: "Open folder",
				hint: "Best for existing folders with Markdown notes.",
				onClick: onOpenSpace,
			},
			{
				key: "create",
				icon: <FolderPlus size={16} />,
				label: "Create space",
				hint: "Start fresh if you do not already have notes.",
				onClick: onCreateSpace,
			},
		);

		return cards;
	}, [
		lastSpacePath,
		lastSpaceName,
		recentSpaces,
		onContinueLastSpace,
		onOpenSpace,
		onCreateSpace,
		onSelectRecentSpace,
	]);

	return (
		<m.div
			className="welcomeScreen"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: skip ? 0 : 0.24 }}
		>
			<div className="welcomeSurface">
				<div className="welcomeLayout">
					<div className="welcomeSteps">
						<div className="welcomeStepItem">
							<span className="welcomeStepNumber">1</span>
							<span className="welcomeStepText">
								Open any folder with .md files
							</span>
						</div>
						<div className="welcomeStepItem">
							<span className="welcomeStepNumber">2</span>
							<span className="welcomeStepText">Create & edit notes</span>
						</div>
						<div className="welcomeStepItem">
							<span className="welcomeStepNumber">3</span>
							<span className="welcomeStepText">
								Chat with AI <span className="welcomeStepHint">(optional)</span>
							</span>
						</div>
					</div>
					<div className="welcomeCardColumn">
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
								Your notes, your files, your machine. Glyph works best with your
								existing folders of Markdown notes, or a new folder if you want
								a clean start.
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
						</m.section>

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
								<div key={f.label} className="welcomeFeatureWrapper">
									<button
										type="button"
										className="welcomeFeatureChip"
										aria-describedby={`feature-desc-${i}`}
										onMouseEnter={() => setHoveredFeature(i)}
										onMouseLeave={() => setHoveredFeature(null)}
										onFocus={() => setFocusedFeature(i)}
										onBlur={() => setFocusedFeature(null)}
									>
										{f.icon}
										{f.label}
									</button>
									<span id={`feature-desc-${i}`} className="sr-only">
										{f.desc}
									</span>
									{activeFeature === i && (
										<div className="welcomeFeaturePopover">
											<p>{f.desc}</p>
										</div>
									)}
								</div>
							))}
						</m.div>
					</div>
				</div>
			</div>
		</m.div>
	);
}
