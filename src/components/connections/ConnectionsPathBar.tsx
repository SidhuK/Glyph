import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Button } from "@/components/ui/shadcn/button";
import { ArrowRight01Icon, Close, Route01Icon } from "@hugeicons/core-free-icons";
import { Fragment, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConnectionsView } from "./ConnectionsViewContext";

/** Longer paths fold their middle into a "more" button so the bar stays on one line. */
const MAX_VISIBLE_STEPS = 5;
const EDGE_STEPS = 2;

type PathItem =
	| { readonly kind: "step"; readonly id: string }
	| { readonly kind: "more"; readonly count: number };

function pathItems(path: readonly string[], expanded: boolean): PathItem[] {
	const steps = (ids: readonly string[]) => ids.map((id): PathItem => ({ kind: "step", id }));
	if (expanded || path.length <= MAX_VISIBLE_STEPS) return steps(path);
	return [
		...steps(path.slice(0, EDGE_STEPS)),
		{ kind: "more", count: path.length - EDGE_STEPS * 2 },
		...steps(path.slice(-EDGE_STEPS)),
	];
}

function Chevron() {
	return (
		<HugeiconsIcon
			icon={ArrowRight01Icon}
			className="connectionsPathBarChevron"
			aria-hidden="true"
		/>
	);
}

export function ConnectionsPathBar() {
	const { t } = useTranslation("shell");
	const { graph, pathMode, pathFromId, pathToId, path, selectNode, clearPath } =
		useConnectionsView();
	const [expandedPathKey, setExpandedPathKey] = useState<string | null>(null);
	if (!graph || !pathMode) return null;

	const labelOf = (id: string) => (graph.hasNode(id) ? graph.getNodeAttribute(id, "label") : id);
	const step = (id: string, isEnd: boolean) => (
		<button
			type="button"
			className="connectionsPathBarStep"
			data-end={isEnd ? "" : undefined}
			title={labelOf(id)}
			onClick={() => selectNode(id)}
		>
			<span className="connectionsPathBarStepLabel">{labelOf(id)}</span>
		</button>
	);

	let steps: ReactNode = null;
	let meta: ReactNode;
	if (path) {
		const pathKey = path.join("\n");
		const lastIndex = path.length - 1;
		steps = pathItems(path, expandedPathKey === pathKey).map((item, index) => (
			<Fragment key={item.kind === "step" ? item.id : "more"}>
				{index > 0 ? <Chevron /> : null}
				{item.kind === "step" ? (
					step(item.id, item.id === path[0] || item.id === path[lastIndex])
				) : (
					<button
						type="button"
						className="connectionsPathBarStep connectionsPathBarMore"
						onClick={() => setExpandedPathKey(pathKey)}
					>
						{t("connections.more", { count: item.count })}
					</button>
				)}
			</Fragment>
		));
		meta = t("connections.pathHops", { count: lastIndex });
	} else if (pathFromId && pathToId) {
		steps = (
			<>
				{step(pathFromId, true)}
				<Chevron />
				{step(pathToId, true)}
			</>
		);
		meta = t("connections.pathNone");
	} else if (pathFromId) {
		steps = step(pathFromId, true);
		meta = t("connections.pathHint");
	} else {
		meta = t("connections.pathHintNoStart");
	}

	return (
		<div className="connectionsFloat connectionsPathBar" role="status">
			<HugeiconsIcon icon={Route01Icon} className="connectionsPathBarIcon" aria-hidden="true" />
			{steps ? <div className="connectionsPathBarSteps">{steps}</div> : null}
			<span className="connectionsPathBarMeta">{meta}</span>
			<Button
				variant="ghost"
				size="icon-xs"
				className="connectionsPathBarClear"
				aria-label={t("connections.pathClear")}
				onClick={clearPath}
			>
				<HugeiconsIcon icon={Close} />
			</Button>
		</div>
	);
}
