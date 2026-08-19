import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { ColorsIcon, FilterIcon, ReloadIcon } from "@hugeicons/core-free-icons";
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
	CONNECTIONS_GRAPH_MIN_CONNECTIONS_MAX,
	CONNECTIONS_GRAPH_SLIDER_MAX,
	CONNECTIONS_GRAPH_SLIDER_MIN,
	type ConnectionsGraphOptions,
	DEFAULT_CONNECTIONS_GRAPH_OPTIONS,
} from "../../lib/connectionsGraphOptions";
import { Toggle } from "../base/toggle/toggle";
import { Button } from "../ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";

interface SpaceConnectionsOptionsPopoverProps {
	options: ConnectionsGraphOptions;
	onOptionsChange: (options: ConnectionsGraphOptions) => void;
	trigger: ReactNode;
}

const NATIVE_RANGE_STYLE = {
	width: 90,
	height: 16,
	margin: 0,
	padding: 0,
	border: 0,
	borderRadius: 0,
	background: "transparent",
	boxShadow: "none",
	outline: "none",
	accentColor: "unset",
	WebkitAppearance: "slider-horizontal",
	appearance: "auto",
} satisfies CSSProperties;

function clampOption(value: number, min: number, max: number) {
	if (!Number.isFinite(value)) return min;
	return Math.min(max, Math.max(min, Math.round(value)));
}

function GraphOptionSlider({
	id,
	label,
	value,
	min = CONNECTIONS_GRAPH_SLIDER_MIN,
	max = CONNECTIONS_GRAPH_SLIDER_MAX,
	onChange,
}: {
	id: string;
	label: string;
	value: number;
	min?: number;
	max?: number;
	onChange: (value: number) => void;
}) {
	return (
		<div className="spaceConnectionsOptionRow">
			<label htmlFor={id}>{label}</label>
			<input
				id={id}
				type="range"
				min={min}
				max={max}
				value={value}
				style={NATIVE_RANGE_STYLE}
				onChange={(event) =>
					onChange(clampOption(Number(event.target.value), min, max))
				}
			/>
			<input
				id={`${id}-value`}
				className="spaceConnectionsOptionValue"
				type="number"
				min={min}
				max={max}
				step={1}
				value={value}
				aria-label={label}
				onChange={(event) =>
					onChange(clampOption(Number(event.target.value), min, max))
				}
			/>
		</div>
	);
}

export function SpaceConnectionsOptionsPopover({
	options,
	onOptionsChange,
	trigger,
}: SpaceConnectionsOptionsPopoverProps) {
	const { t } = useTranslation("shell");
	const patch = (partial: Partial<ConnectionsGraphOptions>) =>
		onOptionsChange({ ...options, ...partial });

	return (
		<Popover>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={8}
				className="databaseViewOptionsPopover"
				onOpenAutoFocus={(event) => event.preventDefault()}
			>
				<div className="databaseViewOptionsMenu spaceConnectionsOptionsMenu">
					<h3 className="spaceConnectionsOptionsHeading">
						<HugeiconsIcon icon={ColorsIcon} size="var(--icon-sm)" />
						{t("connections.display")}
					</h3>
					<GraphOptionSlider
						id="connections-node-size"
						label={t("connections.nodeSize")}
						value={options.nodeSize}
						onChange={(nodeSize) => patch({ nodeSize })}
					/>
					<GraphOptionSlider
						id="connections-link-opacity"
						label={t("connections.linkOpacity")}
						value={options.linkOpacity}
						onChange={(linkOpacity) => patch({ linkOpacity })}
					/>
					<GraphOptionSlider
						id="connections-link-thickness"
						label={t("connections.linkThickness")}
						value={options.linkThickness}
						onChange={(linkThickness) => patch({ linkThickness })}
					/>
					<GraphOptionSlider
						id="connections-label-zoom"
						label={t("connections.labelZoomThreshold")}
						value={options.labelZoomThreshold}
						onChange={(labelZoomThreshold) => patch({ labelZoomThreshold })}
					/>
					<h3 className="spaceConnectionsOptionsHeading">
						<HugeiconsIcon icon={FilterIcon} size="var(--icon-sm)" />
						{t("connections.filters")}
					</h3>
					<Toggle
						checked={options.hideOrphanNodes}
						onCheckedChange={(hideOrphanNodes) => patch({ hideOrphanNodes })}
						label={t("connections.hideOrphans")}
						size="sm"
						slim
					/>
					<GraphOptionSlider
						id="connections-min-connections"
						label={t("connections.minConnections")}
						value={options.minConnections}
						min={0}
						max={CONNECTIONS_GRAPH_MIN_CONNECTIONS_MAX}
						onChange={(minConnections) => patch({ minConnections })}
					/>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="mx-auto mt-1 flex"
						onClick={() => onOptionsChange(DEFAULT_CONNECTIONS_GRAPH_OPTIONS)}
					>
						<HugeiconsIcon icon={ReloadIcon} size="var(--icon-sm)" />
						{t("connections.resetDefaults")}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
