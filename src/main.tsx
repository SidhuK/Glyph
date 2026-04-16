import { getCurrentWindow } from "@tauri-apps/api/window";
import { ThemeProvider } from "next-themes";
import { useTheme } from "next-themes";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Toaster } from "./components/ui/shadcn/sonner";
import {
	applyEditorWidthMode,
	applyUiAccent,
	applyUiDelightfulGlyph,
	applyUiSurfacePreferences,
	applyUiThemeSelection,
	applyUiTypography,
} from "./lib/appearance";
import type { UiAccent, UiDarkThemeId, UiLightThemeId } from "./lib/settings";
import { loadSettings, reloadFromDisk } from "./lib/settings";
import { invoke } from "./lib/tauri";
import { useTauriEvent } from "./lib/tauriEvents";
import { isUiDarkThemeId, isUiLightThemeId } from "./lib/uiThemes";

function Root() {
	return <App />;
}

function ThemeAndTypographyBridge() {
	const { setTheme } = useTheme();
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
	const [delightfulGlyph, setDelightfulGlyph] = React.useState<boolean | null>(
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
				setDelightfulGlyph(settings.ui.delightfulGlyph);
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
		if (
			payload.ui?.accent === "neutral" ||
			payload.ui?.accent === "cerulean" ||
			payload.ui?.accent === "tropical-teal" ||
			payload.ui?.accent === "light-yellow" ||
			payload.ui?.accent === "soft-apricot" ||
			payload.ui?.accent === "vibrant-coral"
		) {
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
		if (typeof payload.ui?.delightfulGlyph === "boolean") {
			setDelightfulGlyph(payload.ui.delightfulGlyph);
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
		applyUiTypography(fontFamily, monoFontFamily, uiFontSize, editorFontSize);
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
		if (typeof delightfulGlyph !== "boolean") return;
		applyUiDelightfulGlyph(delightfulGlyph);
	}, [delightfulGlyph]);

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
