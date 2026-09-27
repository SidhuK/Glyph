import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type AppSettings, loadSettings } from "../../../lib/settings";
import { DURABLE_SETTINGS } from "../../../lib/settings/definitions";
import { invalidateSettingsCache } from "../../../lib/settingsStore";
import { useTauriEvent } from "../../../lib/tauriEvents";

export function applyDomSpellCheck(node: HTMLElement | null | undefined, enabled: boolean): void {
	node?.setAttribute("spellcheck", enabled ? "true" : "false");
}

export function applyEditorSpellCheck(
	editor: { view: { dom: HTMLElement } } | null | undefined,
	enabled: boolean,
): void {
	if (!editor) return;
	try {
		applyDomSpellCheck(editor.view.dom, enabled);
	} catch {
		// TipTap throws when the editor view is not mounted yet.
	}
}

const RAW_SETTINGS_QUERY_KEY = ["raw-markdown-settings"] as const;
const DEFAULT_RAW_SETTINGS = {
	spellCheck: DURABLE_SETTINGS.editorSpellCheck.defaultValue,
	rawMarkdownVimMode: DURABLE_SETTINGS.editorRawMarkdownVimMode.defaultValue,
	rawMarkdownLivePreview: DURABLE_SETTINGS.editorRawMarkdownLivePreview.defaultValue,
};

function selectRawSettings(settings: AppSettings) {
	const { spellCheck, rawMarkdownVimMode, rawMarkdownLivePreview } = settings.editor;
	return { spellCheck, rawMarkdownVimMode, rawMarkdownLivePreview };
}

export function useRawMarkdownSettings() {
	const queryClient = useQueryClient();
	const { data } = useQuery({
		queryKey: RAW_SETTINGS_QUERY_KEY,
		queryFn: () => loadSettings(),
		select: selectRawSettings,
	});
	useTauriEvent("settings:updated", (payload) => {
		const editor = payload.editor;
		if (
			typeof editor?.spellCheck !== "boolean" &&
			typeof editor?.rawMarkdownVimMode !== "boolean" &&
			typeof editor?.rawMarkdownLivePreview !== "boolean"
		) {
			return;
		}
		// Invalidate before refetching, independent of Tauri listener ordering.
		invalidateSettingsCache();
		void queryClient.invalidateQueries({ queryKey: RAW_SETTINGS_QUERY_KEY });
	});
	return data ?? DEFAULT_RAW_SETTINGS;
}
