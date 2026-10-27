import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { useConnectionsView } from "./ConnectionsViewContext";

const MAX_CLUSTER_CHIPS = 5;

interface ClusterChipProps {
	readonly name: string;
	readonly count: number;
	readonly pressed: boolean;
	readonly ariaLabel?: string;
	readonly onToggle: () => void;
}

function ClusterChip({ name, count, pressed, ariaLabel, onToggle }: ClusterChipProps) {
	return (
		<button
			type="button"
			className="connectionsClusterChip"
			aria-pressed={pressed}
			aria-label={ariaLabel}
			title={name}
			onClick={onToggle}
		>
			<span className="connectionsClusterChipDot" aria-hidden="true" />
			<span className="connectionsClusterChipName">{name}</span>
			<span className="connectionsClusterChipCount">{count}</span>
		</button>
	);
}

export function ConnectionsClusterChips() {
	const { t } = useTranslation("shell");
	const {
		graph,
		hiddenCommunities,
		toggleCommunity,
		showUnlinked,
		setShowUnlinked,
		unlinkedCount,
	} = useConnectionsView();
	if (!graph) return null;
	const communities = graph.getAttribute("communities");
	if (communities.length === 0 && unlinkedCount === 0) return null;

	const chips = [...communities]
		.sort((a, b) => b.memberIds.length - a.memberIds.length)
		.map((community) => {
			const name = graph.hasNode(community.hubId)
				? graph.getNodeAttribute(community.hubId, "label")
				: community.hubId;
			return (
				<ClusterChip
					key={community.index}
					name={name}
					count={community.memberIds.length}
					pressed={!hiddenCommunities.has(community.index)}
					ariaLabel={t("connections.toggleCluster", { name })}
					onToggle={() => toggleCommunity(community.index)}
				/>
			);
		});
	const overflow = chips.length - MAX_CLUSTER_CHIPS;

	return (
		<div
			className="connectionsClusterChips"
			role="toolbar"
			aria-label={t("connections.clustersAria")}
		>
			{chips.slice(0, MAX_CLUSTER_CHIPS)}
			{overflow > 0 ? (
				<Popover>
					<PopoverTrigger
						render={
							<button
								type="button"
								className="connectionsClusterChip connectionsClusterChipMore"
								aria-label={t("connections.showAllClusters")}
							>
								{t("connections.more", { count: overflow })}
							</button>
						}
					/>
					<PopoverContent
						side="top"
						align="start"
						sideOffset={8}
						className="connectionsClusterPopover"
						initialFocus={false}
					>
						<div role="group" aria-label={t("connections.clustersAria")}>
							{chips}
						</div>
					</PopoverContent>
				</Popover>
			) : null}
			{unlinkedCount > 0 ? (
				<>
					{communities.length > 0 ? (
						<span className="connectionsClusterChipsDivider" aria-hidden="true" />
					) : null}
					<ClusterChip
						name={t("connections.unlinked")}
						count={unlinkedCount}
						pressed={showUnlinked}
						onToggle={() => setShowUnlinked(!showUnlinked)}
					/>
				</>
			) : null}
		</div>
	);
}
