import { useEffect, useRef, useState } from "react";
import { loadSettings } from "../../../lib/settings";
import { useTauriEvent } from "../../../lib/tauriEvents";

export function useRawMarkdownVimMode(): boolean {
	const [enabled, setEnabled] = useState(false);
	const hasReceivedSettingsUpdateRef = useRef(false);

	useEffect(() => {
		let cancelled = false;
		void loadSettings()
			.then((settings) => {
				if (!cancelled && !hasReceivedSettingsUpdateRef.current) {
					setEnabled(settings.editor.rawMarkdownVimMode);
				}
			})
			.catch(() => {
				if (!cancelled) setEnabled(false);
			});

		return () => {
			cancelled = true;
		};
	}, []);

	useTauriEvent("settings:updated", (payload) => {
		if (typeof payload.editor?.rawMarkdownVimMode === "boolean") {
			hasReceivedSettingsUpdateRef.current = true;
			setEnabled(payload.editor.rawMarkdownVimMode);
		}
	});

	return enabled;
}
