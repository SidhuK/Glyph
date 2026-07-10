import { useEffect, useState } from "react";
import { loadSettings } from "../../../lib/settings";
import { useTauriEvent } from "../../../lib/tauriEvents";

export function applyDomSpellCheck(
	node: HTMLElement | null | undefined,
	enabled: boolean,
): void {
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

function useEditorBooleanSetting(
	key: "spellCheck" | "rawMarkdownVimMode",
	defaultValue: boolean,
): boolean {
	const [enabled, setEnabled] = useState(defaultValue);

	useEffect(() => {
		let cancelled = false;
		void loadSettings()
			.then((settings) => {
				if (cancelled) return;
				const value = settings.editor[key];
				setEnabled(typeof value === "boolean" ? value : defaultValue);
			})
			.catch(() => {
				if (!cancelled) setEnabled(defaultValue);
			});
		return () => {
			cancelled = true;
		};
	}, [defaultValue, key]);

	useTauriEvent("settings:updated", (payload) => {
		const value = payload.editor?.[key];
		if (typeof value === "boolean") setEnabled(value);
	});

	return enabled;
}

export function useEditorSpellCheck(): boolean {
	return useEditorBooleanSetting("spellCheck", true);
}

export function useRawMarkdownVimMode(): boolean {
	return useEditorBooleanSetting("rawMarkdownVimMode", false);
}
