import { useTheme } from "next-themes";

export function useIsDarkTheme(): boolean {
	const { resolvedTheme, theme } = useTheme();
	return (resolvedTheme ?? theme) === "dark";
}
