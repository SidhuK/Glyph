import type { CSSProperties } from "react";
import { databaseValueToneStyleForColor } from "../../lib/database/palette";
import type { EditorTextColor } from "../editor/textColors";

export const springTransition = {
	type: "spring",
	stiffness: 400,
	damping: 25,
} as const;

export const rowVariants = {
	idle: { x: 0, backgroundColor: "transparent" },
	hover: {
		x: 0,
		backgroundColor: "color-mix(in srgb, var(--bg-primary) 85%, transparent)",
	},
	active: {
		backgroundColor: "var(--bg-primary)",
		boxShadow:
			"0 0.5px 1.5px color-mix(in srgb, var(--text-primary) 6%, transparent), inset 0 1px 0 color-mix(in srgb, var(--bg-primary) 50%, transparent)",
	},
	tap: { scale: 0.98 },
};

export function buildRowStyle(
	depth: number,
	toneSeed?: string,
	color?: EditorTextColor | null,
): CSSProperties {
	const paddingLeft = 8 + depth * 10;
	const toneStyle =
		toneSeed && color
			? databaseValueToneStyleForColor(toneSeed, color)
			: ({} as CSSProperties);
	return {
		paddingLeft,
		...toneStyle,
		...(toneSeed && color
			? {
					"--file-tree-row-icon-color": "var(--database-tone)",
					"--file-tree-row-name-color":
						"color-mix(in srgb, var(--database-tone) 55%, var(--text-primary))",
				}
			: {}),
	} as CSSProperties;
}
