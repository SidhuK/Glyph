import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { EyeIcon, GitForkIcon, RepositoryIcon, StarIcon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import type { CommunityAction } from "../../lib/communityInvite";

/** A small arrow pointer that glides onto the preview's button and clicks it on a loop. */
function DemoPointer() {
	return (
		<svg
			className="communityHowToPointer"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path
				d="M4 2v18.5l5.2-4.6 3.5 7.4 3.2-1.5-3.3-7.2H19.5z"
				fill="#111"
				stroke="#fff"
				strokeWidth="1.6"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function BrowserBar({ url }: { url: string }) {
	return (
		<div className="communityHowToBar">
			<i />
			<i />
			<i />
			<span>{url}</span>
		</div>
	);
}

interface CommunityHowToProps {
	/** Which page the preview shows; the other one fades out. */
	show: CommunityAction;
	/** Set when the preview moved on by itself after an action, so the success state shows first. */
	advancing: boolean;
	starred: boolean;
	joined: boolean;
	onAct: (action: CommunityAction) => void;
}

/**
 * Miniature GitHub and Discord pages with a pointer demonstrating the one click each takes,
 * so people know exactly what opens before they leave Glyph.
 */
export function CommunityHowTo({ show, advancing, starred, joined, onAct }: CommunityHowToProps) {
	const { t } = useTranslation("shell");
	const starLabel = (on: boolean) => (
		<>
			<HugeiconsIcon icon={StarIcon} size={11} strokeWidth={2} />
			{on ? t("community.howTo.starred") : t("community.howTo.star")}
		</>
	);

	return (
		<div className="communityHowTo" data-show={show} data-advancing={advancing || undefined}>
			<div className="communityHowToPane" data-pane="starred" aria-hidden={show !== "starred"}>
				<BrowserBar url="github.com/SidhuK/Glyph" />
				<div className="communityHowToPage">
					<div className="communityHowToRepo">
						<HugeiconsIcon icon={RepositoryIcon} size={12} />
						<span className="communityHowToOwner">SidhuK</span>/<b>Glyph</b>
						<span className="communityHowToPill">{t("community.howTo.public")}</span>
					</div>
					<div className="communityHowToButtons">
						<span>
							<HugeiconsIcon icon={EyeIcon} size={11} />
							{t("community.howTo.watch")}
						</span>
						<span>
							<HugeiconsIcon icon={GitForkIcon} size={11} />
							{t("community.howTo.fork")}
						</span>
						<button
							type="button"
							tabIndex={-1}
							className="communityHowToStar"
							data-on={starred || undefined}
							onClick={() => onAct("starred")}
						>
							{starred ? (
								<>
									{starLabel(true)}
									<span className="communityHowToTag">{t("community.howTo.thatsYou")}</span>
								</>
							) : (
								<>
									<span className="communityHowToSwap">
										<span>{starLabel(false)}</span>
										<span className="communityHowToSwapOn" aria-hidden="true">
											{starLabel(true)}
										</span>
									</span>
									<DemoPointer />
									<span className="communityHowToCallout">{t("community.howTo.oneClick")}</span>
								</>
							)}
						</button>
					</div>
				</div>
			</div>

			<div className="communityHowToPane" data-pane="joined" aria-hidden={show !== "joined"}>
				<BrowserBar url="discord.gg/cNqrBfFx7D" />
				<div className="communityHowToPage">
					{joined ? (
						<>
							<div className="communityHowToRepo">
								<b># general</b>
								<span className="communityHowToMuted">Glyph For Mac</span>
							</div>
							<div className="communityHowToMessage">
								<b aria-hidden="true">→</b>
								{t("community.howTo.welcome")}
							</div>
						</>
					) : (
						<>
							<div className="communityHowToInvite">
								<img src="/glyph-app-icon.png" alt="" />
								<span>
									<small>{t("community.howTo.invitedTo")}</small>
									<b>Glyph For Mac</b>
								</span>
							</div>
							<button
								type="button"
								tabIndex={-1}
								className="communityHowToAccept"
								onClick={() => onAct("joined")}
							>
								{t("community.howTo.accept")}
								<DemoPointer />
							</button>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
