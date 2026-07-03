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

export function useEditorSpellCheck(): boolean {
	const [enabled, setEnabled] = useState(true);

	useEffect(() => {
		let cancelled = false;
		void loadSettings()
			.then((settings) => {
				if (cancelled) return;
				setEnabled(settings.editor.spellCheck !== false);
			})
			.catch(() => {
				if (cancelled) return;
				setEnabled(true);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useTauriEvent("settings:updated", (payload) => {
		if (typeof payload.editor?.spellCheck === "boolean") {
			setEnabled(payload.editor.spellCheck);
		}
	});

	return enabled;
}
