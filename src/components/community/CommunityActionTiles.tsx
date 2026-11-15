import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { cn } from "@/lib/utils";
import { DiscordIcon, GithubIcon, StarIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CommunityAction } from "../../lib/communityInvite";
import { useCommunityInvite } from "./useCommunityInvite";

const SPARK_COUNT = 10;

const TILES = [
	{ action: "starred", kind: "github", icon: StarIcon, brandIcon: GithubIcon },
	{ action: "joined", kind: "discord", icon: DiscordIcon, brandIcon: DiscordIcon },
] as const;

/** GitHub star and Discord tiles that switch on, with a small celebration, once used. */
export function CommunityActionTiles({
	compact = false,
	onPreview,
}: {
	compact?: boolean;
	/** Called with the tile under the pointer or keyboard focus, and null when it leaves. */
	onPreview?: (action: CommunityAction | null) => void;
}) {
	const { t } = useTranslation("shell");
	const invite = useCommunityInvite();
	const [celebration, setCelebration] = useState<{ action: CommunityAction; id: number } | null>(
		null,
	);

	const run = (action: CommunityAction) => {
		setCelebration((current) => ({ action, id: (current?.id ?? 0) + 1 }));
		invite.act.mutate(action);
	};

	return (
		<div className={cn("communityTiles", compact && "communityTilesCompact")}>
			{TILES.map(({ action, kind, icon, brandIcon }) => {
				const done = invite[action] || (invite.act.isPending && invite.act.variables === action);
				return (
					<button
						key={action}
						type="button"
						className="communityTile"
						data-kind={kind}
						aria-pressed={done}
						onClick={() => run(action)}
						onPointerEnter={() => onPreview?.(action)}
						onPointerLeave={() => onPreview?.(null)}
						onFocus={() => onPreview?.(action)}
						onBlur={() => onPreview?.(null)}
					>
						<span className="communityTileTop">
							<span className="communityTileBadge" aria-hidden="true">
								<HugeiconsIcon icon={icon} size={20} strokeWidth={1.8} />
								{celebration?.action === action ? (
									<span
										key={celebration.id}
										className="communityBurst"
										onAnimationEnd={(event) => {
											if (event.target === event.currentTarget) setCelebration(null);
										}}
									>
										{Array.from({ length: SPARK_COUNT }, (_, index) => (
											<span key={index} className="communitySpark" />
										))}
									</span>
								) : null}
							</span>
							<span className="communityTileSwitch" aria-hidden="true">
								<span className="communityTileSwitchKnob">
									<HugeiconsIcon icon={Tick02Icon} size={10} strokeWidth={3} />
								</span>
							</span>
						</span>
						<span className="communityTileTitle">
							{t(`community.${kind}.${done ? "doneTitle" : "title"}`)}
						</span>
						<span className="communityTileDescription">
							{t(`community.${kind}.${done ? "doneDescription" : "description"}`)}
						</span>
						<span className="communityTileCta">
							<HugeiconsIcon icon={brandIcon} size={13} aria-hidden="true" />
							{t(`community.${kind}.${done ? "doneCta" : "cta"}`)}
						</span>
					</button>
				);
			})}
		</div>
	);
}
