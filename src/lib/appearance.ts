import type { UiFontFamily, UiFontSize } from "./settings";

const BASE_TEXT_SIZES = {
	xs: 11,
	sm: 12,
	base: 14,
	md: 16,
	lg: 18,
	xl: 20,
	"2xl": 24,
	"3xl": 30,
} as const;

function scaledPx(px: number, scale: number): string {
	return `${Math.round(px * scale)}px`;
}

export function applyUiTypography(
	fontFamily: UiFontFamily,
	monoFontFamily: UiFontFamily,
	fontSize: UiFontSize,
): void {
	const root = document.documentElement;
	const safeFamily = fontFamily.trim() || "Inter";
	const safeMonoFamily = monoFontFamily.trim() || "JetBrains Mono";
	const scale = Math.max(0.5, Math.min(3, fontSize / 14));
	const rootRemPx = 16 * scale;

	// Scale rem-based typography globally so Tailwind/shadcn text sizes follow too.
	root.style.fontSize = `${Math.round(rootRemPx * 100) / 100}px`;
	root.style.setProperty(
		"--font-sans",
		`"${safeFamily}", -apple-system, BlinkMacSystemFont, sans-serif`,
	);
	root.style.setProperty(
		"--font-mono",
		`"${safeMonoFamily}", ui-monospace, SFMono-Regular, Menlo, monospace`,
	);
	root.style.setProperty("--text-xs", scaledPx(BASE_TEXT_SIZES.xs, scale));
	root.style.setProperty("--text-sm", scaledPx(BASE_TEXT_SIZES.sm, scale));
	root.style.setProperty("--text-base", scaledPx(BASE_TEXT_SIZES.base, scale));
	root.style.setProperty("--text-md", scaledPx(BASE_TEXT_SIZES.md, scale));
	root.style.setProperty("--text-lg", scaledPx(BASE_TEXT_SIZES.lg, scale));
	root.style.setProperty("--text-xl", scaledPx(BASE_TEXT_SIZES.xl, scale));
	root.style.setProperty("--text-2xl", scaledPx(BASE_TEXT_SIZES["2xl"], scale));
	root.style.setProperty("--text-3xl", scaledPx(BASE_TEXT_SIZES["3xl"], scale));
}
