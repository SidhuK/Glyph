import { ToggleGroup, ToggleGroupItem } from "@/components/ui/shadcn/toggle-group";
import type { ReactNode } from "react";

interface SettingsSegmentedPickerOption<T extends string> {
	value: T;
	label: string;
	description: string;
}

interface SettingsSegmentedPickerProps<T extends string> {
	ariaLabel: string;
	value: T;
	options: readonly SettingsSegmentedPickerOption<T>[];
	onChange: (value: T) => void;
	renderPreview: (value: T) => ReactNode;
	getDataAttributes?: (value: T) => Record<`data-${string}`, string>;
	disabled?: boolean;
}

export function SettingsSegmentedPicker<T extends string>({
	ariaLabel,
	value,
	options,
	onChange,
	renderPreview,
	getDataAttributes,
	disabled,
}: SettingsSegmentedPickerProps<T>) {
	return (
		<div className="settingsSegmentedPicker">
			<ToggleGroup
				className="settingsSegmentedTrack"
				aria-label={ariaLabel}
				value={value}
				onValueChange={onChange}
				disabled={disabled}
			>
				{options.map((option) => (
					<ToggleGroupItem
						key={option.value}
						value={option.value}
						className="settingsSegmentedOption"
						title={option.description}
						{...getDataAttributes?.(option.value)}
					>
						{renderPreview(option.value)}
						<span className="settingsSegmentedLabel">{option.label}</span>
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</div>
	);
}
