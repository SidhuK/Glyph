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
		boxShadow:
			"inset 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 24%, transparent)",
	},
	tap: { scale: 0.98 },
};

export function truncateMiddle(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	if (maxChars <= 4) return `${text.slice(0, maxChars)}...`;
	const keep = maxChars - 3;
	const head = Math.ceil(keep / 2);
	const tail = Math.floor(keep / 2);
	return `${text.slice(0, head)}...${text.slice(-tail)}`;
}

export function truncateTreeLabel(name: string, isFile: boolean): string {
	const trimmed = name.trim();
	if (!trimmed) return isFile ? "Untitled.md" : "New Folder";
	if (!isFile) return truncateMiddle(trimmed, 18);
	const dotIndex = trimmed.lastIndexOf(".");
	if (dotIndex > 0 && dotIndex < trimmed.length - 1) {
		const ext = trimmed.slice(dotIndex);
		const base = trimmed.slice(0, dotIndex);
		const maxChars = 20;
		if (trimmed.length <= maxChars) return trimmed;
		const availableBase = maxChars - ext.length - 3;
		if (availableBase >= 4) {
			return `${base.slice(0, availableBase)}...${ext}`;
		}
	}
	return truncateMiddle(trimmed, 20);
}

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
	const paddingLeft = 10 + depth * 10;
	return {
		paddingLeft,
		"--tree-line-x": `${depth * 10 + 6}px`,
		"--row-indent": `${paddingLeft}px`,
		"--row-line-opacity": depth === 0 ? 0 : 0.85,
	} as CSSProperties;
}
