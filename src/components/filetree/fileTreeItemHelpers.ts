import type { CSSProperties } from "react";
import { databaseValueToneStyleForColor } from "../../lib/database/palette";
import type { EditorTextColor } from "../editor/textColors";

export const springTransition = {
	type: "spring",
	stiffness: 400,
	damping: 25,
} as const;

export const rowVariants = {
	idle: { x: 0 },
	hover: { x: 0 },
	active: { x: 0 },
	tap: { x: 0 },
};

export function virtualRowStyle(start: number | undefined): CSSProperties | undefined {
	if (start === undefined) return undefined;
	return {
		position: "absolute",
		top: 0,
		left: 0,
		width: "100%",
		transform: `translateY(${start}px)`,
	};
}

export function buildRowStyle(
	depth: number,
	toneSeed?: string,
	color?: EditorTextColor | null,
): CSSProperties {
	// Each level steps one icon plus the row gap, so a child's icon sits under its parent's label.
	const paddingLeft = `calc(8px + ${depth} * (var(--icon-lg) + 8px))`;
	const toneStyle =
		toneSeed && color ? databaseValueToneStyleForColor(toneSeed, color) : ({} as CSSProperties);
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
