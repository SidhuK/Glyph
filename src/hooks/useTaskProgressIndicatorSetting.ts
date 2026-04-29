import { useEffect, useRef, useState } from "react";
import { loadSettings } from "../lib/settings";
import { useTauriEvent } from "../lib/tauriEvents";

export function useTaskProgressIndicatorSetting(defaultValue: boolean): boolean;
export function useTaskProgressIndicatorSetting(
	defaultValue: boolean | null,
): boolean | null;
export function useTaskProgressIndicatorSetting(defaultValue: boolean | null) {
	const [showTaskProgressIndicator, setShowTaskProgressIndicator] =
		useState(defaultValue);
	const settingsVersionRef = useRef(0);

	useEffect(() => {
		let cancelled = false;
		const requestedAtVersion = settingsVersionRef.current;
		void loadSettings()
			.then((settings) => {
				if (cancelled) return;
				if (settingsVersionRef.current !== requestedAtVersion) return;
				setShowTaskProgressIndicator(settings.ui.showTaskProgressIndicator);
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, []);

	useTauriEvent("settings:updated", (payload) => {
		if (typeof payload.ui?.showTaskProgressIndicator === "boolean") {
			settingsVersionRef.current += 1;
			setShowTaskProgressIndicator(payload.ui.showTaskProgressIndicator);
		}
	});

	return showTaskProgressIndicator;
}
