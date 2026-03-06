import type { UiAccent } from "../../lib/settings";
import { ACCENT_OPTIONS } from "./accentOptions";

interface AppearanceAccentCardProps {
	accent: UiAccent;
	onAccentChange: (accent: UiAccent) => Promise<void>;
}

export function AppearanceAccentCard({
	accent,
	onAccentChange,
}: AppearanceAccentCardProps) {
	const selectedAccent =
		ACCENT_OPTIONS.find((option) => option.id === accent) ?? ACCENT_OPTIONS[0];

	return (
		<section className="settingsCard">
			<div className="settingsCardHeader">
				<div>
					<div className="settingsCardTitle">Accent</div>
					<div className="settingsCardHint">
						Choose the color used for highlights and focus.
					</div>
				</div>
			</div>
			<div className="settingsField">
				<div>
					<label className="settingsLabel" htmlFor="settingsAccent">
						Palette
					</label>
				</div>
				<div className="settingsAccentSelector">
					<div className="settingsAccentPreview" aria-hidden="true">
						<span
							className="settingsAccentPreviewSwatch"
							style={{ background: selectedAccent.color }}
						/>
						<span className="settingsAccentPreviewLabel">
							{selectedAccent.label}
						</span>
					</div>
					<div
						className="settingsAccentRow"
						role="radiogroup"
						aria-label="Accent color"
					>
						{ACCENT_OPTIONS.map((option) => (
							<button
								key={option.id}
								type="button"
								className={`settingsAccentDot ${accent === option.id ? "active" : ""}`}
								onClick={() => void onAccentChange(option.id)}
								aria-pressed={accent === option.id}
								aria-label={option.label}
								title={option.label}
							>
								<span style={{ background: option.color }} />
							</button>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
