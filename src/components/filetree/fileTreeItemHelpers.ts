import type { CSSProperties } from "react";

export const springTransition = {
	type: "spring",
	stiffness: 400,
	damping: 25,
} as const;

export const rowVariants = {
	idle: { x: 0, backgroundColor: "transparent" },
	hover: { x: 4, backgroundColor: "var(--bg-hover)" },
	active: {
		backgroundColor:
			"color-mix(in srgb, var(--interactive-accent) 14%, transparent)",
	},
	tap: { scale: 0.98 },
};

export function splitEditableFileName(name: string): {
	stem: string;
	ext: string;
} {
	const trimmed = name.trim();
	const dotIndex = trimmed.lastIndexOf(".");
	if (dotIndex <= 0 || dotIndex === trimmed.length - 1) {
		return { stem: trimmed, ext: "" };
	}
	return {
		stem: trimmed.slice(0, dotIndex),
		ext: trimmed.slice(dotIndex),
	};
}

export function buildRowStyle(depth: number): CSSProperties {
	const paddingLeft = 4 + depth * 10;
	return {
		paddingLeft,
		"--tree-line-x": `${depth * 10 + 2}px`,
		"--row-indent": `${paddingLeft}px`,
		"--row-line-opacity": depth === 0 ? 0 : 0.85,
	} as CSSProperties;
}
