import { getCurrentWindow } from "@tauri-apps/api/window";
import { ThemeProvider } from "next-themes";
import { useTheme } from "next-themes";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import SettingsApp from "./SettingsApp";
import { Toaster } from "./components/ui/shadcn/sonner";
import { applyUiTypography } from "./lib/appearance";
import { loadSettings, reloadFromDisk } from "./lib/settings";
import { useTauriEvent } from "./lib/tauriEvents";

function isSettingsRoute(hash: string): boolean {
	return hash.startsWith("#/settings");
}

function Root() {
	const [hash, setHash] = React.useState(() => window.location.hash);
	React.useEffect(() => {
		const onHashChange = () => setHash(window.location.hash);
		window.addEventListener("hashchange", onHashChange);
		return () => window.removeEventListener("hashchange", onHashChange);
	}, []);

	return isSettingsRoute(hash) ? <SettingsApp /> : <App />;
}

function ThemeAndTypographyBridge() {
	const { setTheme } = useTheme();
	const [fontFamily, setFontFamily] = React.useState<string | null>(null);
	const [fontSize, setFontSize] = React.useState<number | null>(null);

	React.useEffect(() => {
		let cancelled = false;

		const applyFromSettings = async (withReload: boolean) => {
			try {
				if (withReload) {
					await reloadFromDisk();
				}
				const settings = await loadSettings();
				if (cancelled) return;
				setTheme(settings.ui.theme);
				setFontFamily(settings.ui.fontFamily);
				setFontSize(settings.ui.fontSize);
			} catch {
				// best-effort hydration
			}
		};

		void applyFromSettings(false);

		let cleanup: (() => void) | null = null;
		try {
			const win = getCurrentWindow();
			void win
				.onFocusChanged(({ payload: focused }) => {
					if (!focused || cancelled) return;
					void applyFromSettings(true);
				})
				.then((unlisten) => {
					cleanup = unlisten;
				});
		} catch {
			// not running inside tauri window context
		}

		return () => {
			cancelled = true;
			cleanup?.();
		};
	}, [setTheme]);

	useTauriEvent("settings:updated", (payload) => {
		const nextTheme = payload.ui?.theme;
		if (
			nextTheme === "light" ||
			nextTheme === "dark" ||
			nextTheme === "system"
		) {
			setTheme(nextTheme);
		}
		if (typeof payload.ui?.fontFamily === "string") {
			setFontFamily(payload.ui.fontFamily);
		}
		if (
			typeof payload.ui?.fontSize === "number" &&
			Number.isFinite(payload.ui.fontSize)
		) {
			setFontSize(payload.ui.fontSize);
		}
	});

	React.useEffect(() => {
		if (!fontFamily || typeof fontSize !== "number") return;
		applyUiTypography(fontFamily, fontSize);
	}, [fontFamily, fontSize]);

	return null;
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element");

ReactDOM.createRoot(rootEl).render(
	<React.StrictMode>
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
			<ThemeAndTypographyBridge />
			<Root />
			<Toaster />
		</ThemeProvider>
	</React.StrictMode>,
);
