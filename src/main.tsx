import { getCurrentWindow } from "@tauri-apps/api/window";
import { ThemeProvider } from "next-themes";
import { useTheme } from "next-themes";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ExternalMarkdownWindow } from "./components/external-markdown/ExternalMarkdownWindow";
import { QuickNoteWindow } from "./components/quick-note/QuickNoteWindow";
import { Toaster } from "./components/ui/shadcn/sonner";
import {
	applyEditorWidthMode,
	applyUiAccent,
	applyUiSurfacePreferences,
	applyUiThemeSelection,
	applyUiTypography,
} from "./lib/appearance";
import type { UiAccent, UiDarkThemeId, UiLightThemeId } from "./lib/settings";
import { isUiAccent, loadSettings, reloadFromDisk } from "./lib/settings";
import { invoke } from "./lib/tauri";
import { useTauriEvent } from "./lib/tauriEvents";
import { isUiDarkThemeId, isUiLightThemeId } from "./lib/uiThemes";
import {
	EXTERNAL_MARKDOWN_WINDOW_PREFIX,
	MAIN_WINDOW_LABEL,
	QUICK_NOTE_WINDOW_LABEL,
} from "./lib/windowLabels";

function ThemeAndTypographyBridge() {
	const { setTheme, resolvedTheme, theme } = useTheme();
	const [accent, setAccent] = React.useState<UiAccent | null>(null);
	const [lightThemeId, setLightThemeId] = React.useState<UiLightThemeId | null>(
		null,
	);
	const [darkThemeId, setDarkThemeId] = React.useState<UiDarkThemeId | null>(
		null,
	);
	const [fontFamily, setFontFamily] = React.useState<string | null>(null);
	const [monoFontFamily, setMonoFontFamily] = React.useState<string | null>(
		null,
	);
	const [uiFontSize, setUiFontSize] = React.useState<number | null>(null);
	const [editorFontSize, setEditorFontSize] = React.useState<number | null>(
		null,
	);
	const [translucentApp, setTranslucentApp] = React.useState<boolean | null>(
		null,
	);

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
				setLightThemeId(settings.ui.lightThemeId);
				setDarkThemeId(settings.ui.darkThemeId);
				setAccent(settings.ui.accent);
				setFontFamily(settings.ui.fontFamily);
				setMonoFontFamily(settings.ui.monoFontFamily);
				setUiFontSize(settings.ui.fontSize);
				setEditorFontSize(settings.ui.editorFontSize);
				setTranslucentApp(settings.ui.translucentApp);
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
			setLightThemeId(payload.ui.lightThemeId);
		}
		if (isUiDarkThemeId(payload.ui?.darkThemeId)) {
			setDarkThemeId(payload.ui.darkThemeId);
		}
		if (isUiAccent(payload.ui?.accent)) {
			setAccent(payload.ui.accent);
		}
		if (typeof payload.ui?.fontFamily === "string") {
			setFontFamily(payload.ui.fontFamily);
		}
		if (typeof payload.ui?.monoFontFamily === "string") {
			setMonoFontFamily(payload.ui.monoFontFamily);
		}
		if (
			typeof payload.ui?.fontSize === "number" &&
			Number.isFinite(payload.ui.fontSize)
		) {
			setUiFontSize(payload.ui.fontSize);
		}
		if (
			typeof payload.ui?.editorFontSize === "number" &&
			Number.isFinite(payload.ui.editorFontSize)
		) {
			setEditorFontSize(payload.ui.editorFontSize);
		}
		if (typeof payload.ui?.translucentApp === "boolean") {
			setTranslucentApp(payload.ui.translucentApp);
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
		if (
			!fontFamily ||
			!monoFontFamily ||
			typeof uiFontSize !== "number" ||
			typeof editorFontSize !== "number"
		) {
			return;
		}
		const applyTypography = () => {
			applyUiTypography(fontFamily, monoFontFamily, uiFontSize, editorFontSize);
		};
		applyTypography();
		window.addEventListener("resize", applyTypography);
		return () => {
			window.removeEventListener("resize", applyTypography);
		};
	}, [editorFontSize, fontFamily, monoFontFamily, uiFontSize]);

	React.useEffect(() => {
		if (!accent) return;
		applyUiAccent(accent);
	}, [accent]);

	React.useEffect(() => {
		if (!lightThemeId || !darkThemeId) return;
		applyUiThemeSelection(lightThemeId, darkThemeId);
	}, [darkThemeId, lightThemeId]);

	React.useEffect(() => {
		if (typeof translucentApp !== "boolean") return;
		applyUiSurfacePreferences({ translucentApp });
	}, [translucentApp]);

	React.useEffect(() => {
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
	}, [resolvedTheme, theme, translucentApp]);

	return null;
}

if (import.meta.env.PROD) {
	document.addEventListener("contextmenu", (e) => {
		const target = e.target;
		if (
			target instanceof Element &&
			target.closest(
				'input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]',
			)
		) {
			return;
		}
		e.preventDefault();
	});
	document.addEventListener("keydown", (e) => {
		const key = e.key.toLowerCase();
		if (key === "f5" || ((e.ctrlKey || e.metaKey) && key === "r")) {
			e.preventDefault();
		}
	});
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

const windowLabel = currentWindowLabel();
const isQuickNoteWindow = windowLabel === QUICK_NOTE_WINDOW_LABEL;
const isExternalMarkdownWindow = windowLabel.startsWith(
	EXTERNAL_MARKDOWN_WINDOW_PREFIX,
);

ReactDOM.createRoot(rootEl).render(
	<React.StrictMode>
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
			<ThemeAndTypographyBridge />
			{isQuickNoteWindow ? (
				<QuickNoteWindow />
			) : isExternalMarkdownWindow ? (
				<ExternalMarkdownWindow />
			) : (
				<App />
			)}
			<Toaster />
		</ThemeProvider>
	</React.StrictMode>,
);
