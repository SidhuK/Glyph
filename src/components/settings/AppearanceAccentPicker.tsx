import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";
import type { UiAccent } from "../../lib/settings";
import { ACCENT_OPTIONS } from "./accentOptions";

interface AppearanceAccentPickerProps {
	accent: UiAccent;
	onAccentChange: (accent: UiAccent) => Promise<void>;
	"aria-label"?: string;
}

export function AppearanceAccentPicker({
	accent,
	onAccentChange,
	"aria-label": ariaLabel = "Accent color",
}: AppearanceAccentPickerProps) {
	return (
		<div className="settingsAccentPicker">
			<div
				className="settingsAccentOptions"
				role="radiogroup"
				aria-label={ariaLabel}
			>
				{ACCENT_OPTIONS.map((option) => (
					<label
						key={option.id}
						className={cn(
							"settingsAccentDot",
							accent === option.id && "is-active",
						)}
						title={option.label}
						style={
							{ "--settings-accent-swatch": option.color } as CSSProperties
						}
					>
						<input
							type="radio"
							name="settings-accent"
							checked={accent === option.id}
							onChange={() => void onAccentChange(option.id)}
							className="settingsAccentInput"
							aria-label={option.label}
						/>
						<span className="settingsAccentDotInner" aria-hidden="true" />
					</label>
				))}
			</div>
		</div>
	);
}
