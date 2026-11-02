import type { ReactNode, SyntheticEvent } from "react";
import type { UiThemeOption } from "../../../lib/uiThemes";
import { cn } from "@/lib/utils";

export type ThemeCardMode = "light" | "dark";

/** Ink first, then the theme's eight named palette hues, left to right. */
const DOT_TONES = [
	"ink",
	"red",
	"orange",
	"yellow",
	"green",
	"cyan",
	"blue",
	"purple",
	"gray",
] as const;

interface ThemeCardProps {
	mode: ThemeCardMode;
	groupName: string;
	option: UiThemeOption<string>;
	checked: boolean;
	onSelect: (id: string) => void;
	/** Rendered beside the label (never inside it) so its button stays a separate control. */
	menu?: ReactNode;
}

/** Keeps the whole card visible when the radio gains focus or selection inside the scroller. */
function revealCard(event: SyntheticEvent<HTMLInputElement>) {
	event.currentTarget
		.closest(".themeCard")
		?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/** One theme as a radio: a swatch scoped to the theme's tokens, named in the app's own ink. */
export function ThemeCard({ mode, groupName, option, checked, onSelect, menu }: ThemeCardProps) {
	return (
		<div className="themeCard">
			<label className="themeCardLabel" title={option.label}>
				<input
					type="radio"
					name={groupName}
					value={option.id}
					checked={checked}
					onChange={(event) => {
						revealCard(event);
						onSelect(option.id);
					}}
					onFocus={revealCard}
					className="themeCardInput sr-only"
				/>
				<span className="themeCardFrame">
					<span
						className={cn("themeCardSwatch appearanceThemePreview", mode)}
						data-light-theme={mode === "light" ? option.id : undefined}
						data-dark-theme={mode === "dark" ? option.id : undefined}
						aria-hidden="true"
					>
						<span className="themeCardSwatchTop">
							<span className="themeCardSample">Aa</span>
							<span className="themeCardLink">[[ ]]</span>
							<span className="themeCardAccent" />
						</span>
						<span className="themeCardDots">
							{DOT_TONES.map((tone) => (
								<span key={tone} className="themeCardDot" data-tone={tone} />
							))}
						</span>
					</span>
				</span>
				<span className="themeCardName">{option.label}</span>
			</label>
			{menu}
		</div>
	);
}
