import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { DiscordIcon, StarIcon } from "@hugeicons/core-free-icons";
import { useRef, useState } from "react";
import type { CommunityAction } from "../../lib/communityInvite";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../lib/errorUtils";
import { toast } from "../../lib/toast";
import { Button } from "../ui/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/shadcn/dialog";
import { CommunityActionTiles } from "./CommunityActionTiles";
import { CommunityHowTo } from "./CommunityHowTo";
import { useCommunityInvite, useCommunityInviteLaunch } from "./useCommunityInvite";

/** Glyph's icon with a GitHub star and a Discord bubble orbiting it on a tilted ring. */
function CommunityOrbit({ starred, joined }: { starred: boolean; joined: boolean }) {
	return (
		<div
			className="communityHero"
			data-starred={starred || undefined}
			data-joined={joined || undefined}
			aria-hidden="true"
		>
			<div className="communityHeroSky" />
			<div className="communityHeroAurora" />
			<div className="communityOrbit">
				<span className="communityOrbitRing communityOrbitRingOuter" />
				<span className="communityOrbitRing communityOrbitRingInner" />
				<img className="communityOrbitCore" src="/glyph-app-icon.png" alt="" />
				<span className="communityOrbitArm communityOrbitArmStar">
					<span className="communitySatellite communitySatelliteStar">
						<HugeiconsIcon icon={StarIcon} size={17} strokeWidth={2} />
					</span>
				</span>
				<span className="communityOrbitArm communityOrbitArmDiscord">
					<span className="communitySatellite communitySatelliteDiscord">
						<HugeiconsIcon icon={DiscordIcon} size={17} strokeWidth={2} />
					</span>
				</span>
				<span className="communityOrbitArm communityOrbitArmMote">
					<span className="communitySatellite communitySatelliteMote" />
				</span>
			</div>
		</div>
	);
}

export function CommunityInviteDialog() {
	const { t } = useTranslation("shell");
	const invite = useCommunityInvite();
	const launch = useCommunityInviteLaunch({ claim: true });
	const [previewed, setPreviewed] = useState<CommunityAction | null>(null);
	const closeButtonRef = useRef<HTMLButtonElement>(null);
	const anyDone = invite.starred || invite.joined;
	// Hovering or focusing a tile previews its page; otherwise show the next step to take.
	const show: CommunityAction = previewed ?? (invite.starred ? "joined" : "starred");

	const stopAsking = () => {
		launch.dismiss();
		invite.setEnabled.mutate(false, {
			onError: (error) =>
				toast.error(t("community.errors.saveFailed"), {
					description: extractErrorMessage(error),
				}),
		});
	};

	return (
		<Dialog open={launch.open} onOpenChange={(next) => !next && launch.dismiss()}>
			<DialogContent
				className="communityInvite"
				showCloseButton={false}
				initialFocus={closeButtonRef}
			>
				<CommunityOrbit starred={invite.starred} joined={invite.joined} />
				<div className="communityInviteBody">
					<p className="communityInviteEyebrow">{t("community.eyebrow")}</p>
					<DialogTitle className="communityInviteTitle">{t("community.title")}</DialogTitle>
					<DialogDescription className="communityInviteDescription">
						{t("community.description")}
					</DialogDescription>
					<CommunityHowTo
						show={show}
						advancing={previewed === null && invite.starred}
						starred={invite.starred}
						joined={invite.joined}
						onAct={(action) => invite.act.mutate(action)}
					/>
					<CommunityActionTiles onPreview={setPreviewed} />
				</div>
				<footer className="communityInviteFooter">
					<button type="button" className="communityInviteQuiet" onClick={stopAsking}>
						{t("community.dontAskAgain")}
					</button>
					<Button
						ref={closeButtonRef}
						type="button"
						size="sm"
						variant="outline"
						onClick={launch.dismiss}
					>
						{anyDone ? t("community.done") : t("community.later")}
					</Button>
				</footer>
			</DialogContent>
		</Dialog>
	);
}
