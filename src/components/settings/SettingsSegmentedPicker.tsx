import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface SettingsSegmentedPickerOption<T extends string> {
	value: T;
	label: string;
	description: string;
}

interface SettingsSegmentedPickerProps<T extends string> {
	name: string;
	ariaLabel: string;
	value: T;
	options: readonly SettingsSegmentedPickerOption<T>[];
	onChange: (value: T) => void;
	renderPreview: (value: T) => ReactNode;
	getDataAttributes?: (value: T) => Record<`data-${string}`, string>;
}

export function SettingsSegmentedPicker<T extends string>({
	name,
	ariaLabel,
	value,
	options,
	onChange,
	renderPreview,
	getDataAttributes,
}: SettingsSegmentedPickerProps<T>) {
	return (
		<div className="settingsSegmentedPicker">
			<div
				className="settingsSegmentedTrack"
				role="radiogroup"
				aria-label={ariaLabel}
			>
				{options.map((option) => (
					<label
						key={option.value}
						className={cn(
							"settingsSegmentedOption",
							value === option.value && "is-active",
						)}
						title={option.description}
						{...(getDataAttributes?.(option.value) ?? {})}
					>
						<input
							type="radio"
							name={name}
							checked={value === option.value}
							onChange={() => onChange(option.value)}
							className="settingsSegmentedInput"
							aria-label={option.label}
						/>
						{renderPreview(option.value)}
						<span className="settingsSegmentedLabel">{option.label}</span>
					</label>
				))}
			</div>
		</div>
	);
}
