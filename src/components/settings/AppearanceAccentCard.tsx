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
	return (
		<section className="settingsCard">
			<div className="settingsCardHeader">
				<div>
					<div className="settingsCardTitle">Accent</div>
					<div className="settingsCardHint">
						Choose the highlight color used across interactive UI.
					</div>
				</div>
			</div>
			<div className="settingsField">
				<div>
					<div className="settingsLabel">Palette</div>
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
		</section>
	);
}
