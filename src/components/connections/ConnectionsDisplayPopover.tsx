import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { ReloadIcon, SlidersHorizontalIcon } from "@hugeicons/core-free-icons";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
	CONNECTIONS_GRAPH_MIN_CONNECTIONS_MAX,
	CONNECTIONS_GRAPH_SLIDER_MAX,
	CONNECTIONS_GRAPH_SLIDER_MIN,
	type ConnectionsGraphOptions,
	DEFAULT_CONNECTIONS_GRAPH_OPTIONS,
} from "../../lib/connectionsGraphOptions";
import { Button } from "../ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { useConnectionsView } from "./ConnectionsViewContext";

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

function OptionSlider({
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
				onChange={(event) => onChange(clampOption(Number(event.target.value), min, max))}
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
				onChange={(event) => onChange(clampOption(Number(event.target.value), min, max))}
			/>
		</div>
	);
}

export function ConnectionsDisplayPopover() {
	const { t } = useTranslation("shell");
	const { options, setOptions } = useConnectionsView();
	const patch = (partial: Partial<ConnectionsGraphOptions>) =>
		setOptions({ ...options, ...partial });

	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button type="button" size="sm" variant="ghost" static>
						<HugeiconsIcon icon={SlidersHorizontalIcon} size="var(--icon-sm)" />
						{t("connections.display")}
					</Button>
				}
			/>
			<PopoverContent
				align="end"
				sideOffset={8}
				className="databaseViewOptionsPopover"
				initialFocus={false}
			>
				<div className="databaseViewOptionsMenu spaceConnectionsOptionsMenu">
					<OptionSlider
						id="connections-min-connections"
						label={t("connections.minConnections")}
						value={options.minConnections}
						min={0}
						max={CONNECTIONS_GRAPH_MIN_CONNECTIONS_MAX}
						onChange={(minConnections) => patch({ minConnections })}
					/>
					<OptionSlider
						id="connections-node-size"
						label={t("connections.nodeSize")}
						value={options.nodeSize}
						onChange={(nodeSize) => patch({ nodeSize })}
					/>
					<OptionSlider
						id="connections-link-opacity"
						label={t("connections.linkOpacity")}
						value={options.linkOpacity}
						onChange={(linkOpacity) => patch({ linkOpacity })}
					/>
					<OptionSlider
						id="connections-link-thickness"
						label={t("connections.linkThickness")}
						value={options.linkThickness}
						onChange={(linkThickness) => patch({ linkThickness })}
					/>
					<OptionSlider
						id="connections-edge-curvature"
						label={t("connections.edgeCurvature")}
						value={options.edgeBundling}
						onChange={(edgeBundling) => patch({ edgeBundling })}
					/>
					<OptionSlider
						id="connections-label-zoom"
						label={t("connections.labelZoomThreshold")}
						value={options.labelZoomThreshold}
						onChange={(labelZoomThreshold) => patch({ labelZoomThreshold })}
					/>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="mx-auto mt-1 flex"
						onClick={() => setOptions(DEFAULT_CONNECTIONS_GRAPH_OPTIONS)}
					>
						<HugeiconsIcon icon={ReloadIcon} size="var(--icon-sm)" />
						{t("connections.resetDefaults")}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
