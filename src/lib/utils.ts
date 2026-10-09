import type { CSSProperties } from "react";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}

/** Inline style with typed CSS custom properties, e.g. `CssVars<"--task-depth">`. */
export type CssVars<K extends string> = CSSProperties & Record<K, string | number>;
