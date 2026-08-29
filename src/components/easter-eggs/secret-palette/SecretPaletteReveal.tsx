import "./secretPaletteReveal.css";

const ASTERISK_COLORS = [
	"var(--glyph-inline-color-orange)",
	"var(--glyph-inline-color-blue)",
	"var(--glyph-inline-color-purple)",
] as const;

export function SecretPaletteReveal() {
	return (
		<div className="secretPaletteReveal" aria-hidden="true">
			<div className="secretPaletteRevealCard">
				<div className="secretPaletteRevealStars">
					{ASTERISK_COLORS.map((color, index) => (
						<span
							key={color}
							className="secretPaletteRevealStar"
							style={{ color, animationDelay: `${index * 90}ms` }}
						>
							✱
						</span>
					))}
				</div>
			</div>
		</div>
	);
}
