import { getCurrentWindow } from "@tauri-apps/api/window";
import { ThemeProvider } from "next-themes";
import { useTheme } from "next-themes";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { QuickNoteWindow } from "./components/quick-note/QuickNoteWindow";
import { Toaster } from "./components/ui/shadcn/sonner";
import {
	applyEditorWidthMode,
	applyUiAccent,
	applyUiSurfacePreferences,
	applyUiThemeSelection,
	applyUiTypography,
} from "./lib/appearance";
import { isUiAccent, loadSettings, reloadFromDisk } from "./lib/settings";
import { invoke } from "./lib/tauri";
import { useTauriEvent } from "./lib/tauriEvents";
import { isUiDarkThemeId, isUiLightThemeId } from "./lib/uiThemes";
import { MAIN_WINDOW_LABEL, QUICK_NOTE_WINDOW_LABEL } from "./lib/windowLabels";

function ThemeAndTypographyBridge() {
	const { setTheme, resolvedTheme, theme } = useTheme();
	const translucentAppRef = React.useRef<boolean | null>(null);

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
				applyUiThemeSelection(
					settings.ui.lightThemeId,
					settings.ui.darkThemeId,
				);
				applyUiAccent(settings.ui.accent);
				applyUiTypography(
					settings.ui.fontFamily,
					settings.ui.monoFontFamily,
					settings.ui.fontSize,
					settings.ui.editorFontSize,
				);
				translucentAppRef.current = settings.ui.translucentApp;
				applyUiSurfacePreferences({
					translucentApp: settings.ui.translucentApp,
				});
				applyEditorWidthMode(settings.editor.editorWidthMode);
				void invoke("index_set_people_mentions_as_tags_enabled", {
					enabled: settings.editor.enablePeopleMentionsAsTags,
				}).catch(() => {});
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
		if (isUiLightThemeId(payload.ui?.lightThemeId)) {
			applyUiThemeSelection(
				payload.ui.lightThemeId,
				isUiDarkThemeId(payload.ui?.darkThemeId)
					? payload.ui.darkThemeId
					: "graphite",
			);
		}
		if (isUiDarkThemeId(payload.ui?.darkThemeId)) {
			applyUiThemeSelection(
				isUiLightThemeId(payload.ui?.lightThemeId)
					? payload.ui.lightThemeId
					: "paper",
				payload.ui.darkThemeId,
			);
		}
		if (isUiAccent(payload.ui?.accent)) {
			applyUiAccent(payload.ui.accent);
		}
		if (
			typeof payload.ui?.fontFamily === "string" &&
			typeof payload.ui?.monoFontFamily === "string" &&
			typeof payload.ui?.fontSize === "number" &&
			Number.isFinite(payload.ui.fontSize) &&
			typeof payload.ui?.editorFontSize === "number" &&
			Number.isFinite(payload.ui.editorFontSize)
		) {
			applyUiTypography(
				payload.ui.fontFamily,
				payload.ui.monoFontFamily,
				payload.ui.fontSize,
				payload.ui.editorFontSize,
			);
		}
		if (typeof payload.ui?.translucentApp === "boolean") {
			translucentAppRef.current = payload.ui.translucentApp;
			applyUiSurfacePreferences({
				translucentApp: payload.ui.translucentApp,
			});
		}
		if (
			payload.editor?.editorWidthMode === "compact" ||
			payload.editor?.editorWidthMode === "comfortable" ||
			payload.editor?.editorWidthMode === "wide"
		) {
			applyEditorWidthMode(payload.editor.editorWidthMode);
		}
		if (typeof payload.editor?.enablePeopleMentionsAsTags === "boolean") {
			void invoke("index_set_people_mentions_as_tags_enabled", {
				enabled: payload.editor.enablePeopleMentionsAsTags,
			}).catch(() => {});
		}
	});

	React.useEffect(() => {
		const translucentApp = translucentAppRef.current;
		if (typeof translucentApp !== "boolean") return;
		if (!translucentApp) {
			void invoke("set_window_vibrancy_theme", { theme: "none" }).catch(
				() => {},
			);
			return;
		}
		if (resolvedTheme !== "dark" && resolvedTheme !== "light") return;
		const vibrancyTheme =
			theme === "system"
				? resolvedTheme === "dark"
					? "system-dark"
					: "system-light"
				: resolvedTheme;
		void invoke("set_window_vibrancy_theme", { theme: vibrancyTheme }).catch(
			() => {},
		);
	}, [resolvedTheme, theme]);

	return null;
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element");

function currentWindowLabel(): string {
	try {
		return getCurrentWindow().label;
	} catch {
		return MAIN_WINDOW_LABEL;
	}
}

const isQuickNoteWindow = currentWindowLabel() === QUICK_NOTE_WINDOW_LABEL;

ReactDOM.createRoot(rootEl).render(
	<React.StrictMode>
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
			<ThemeAndTypographyBridge />
			{isQuickNoteWindow ? <QuickNoteWindow /> : <App />}
			<Toaster />
		</ThemeProvider>
	</React.StrictMode>,
);
