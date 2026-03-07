import type { CSSProperties } from "react";
import type { FileTreeMoveOptions } from "../../hooks/fileTreeHelpers";

const INDENT_STEP = 18;
const BASE_PADDING = 10;

export const springTransition = {
	type: "spring",
	stiffness: 400,
	damping: 25,
} as const;

// Export for convenience so consumers don't need two imports
export type { FileTreeMoveOptions };

export const rowTransition = {
	duration: 0.11,
	ease: "easeOut",
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
	const indentStep = INDENT_STEP;
	const paddingLeft = BASE_PADDING + depth * indentStep;
	return {
		"--file-tree-depth": depth,
		"--file-tree-indent-step": `${indentStep}px`,
		"--file-tree-connector-opacity": depth > 0 ? 1 : 0,
		paddingLeft,
	} as CSSProperties;
}
