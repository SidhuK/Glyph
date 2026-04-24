import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type EffectiveShortcutBindings,
	type ShortcutBindings,
	getEffectiveShortcutBindings,
	loadShortcutSettings,
	reloadFromDisk,
} from "../lib/settings";
import {
	SHORTCUT_ACTIONS,
	type ShortcutActionDefinition,
	type ShortcutActionId,
} from "../lib/shortcuts/registry";
import { useTauriEvent } from "../lib/tauriEvents";

const DEFAULT_EFFECTIVE_BINDINGS = getEffectiveShortcutBindings({});
const FOCUS_REFRESH_DELAY_MS = 200;

export function useShortcutBindings() {
	const [bindings, setBindings] = useState<EffectiveShortcutBindings>(
		DEFAULT_EFFECTIVE_BINDINGS,
	);
	const mountedRef = useRef(false);

	const refresh = useCallback(async (withReload = false) => {
		if (withReload) {
			await reloadFromDisk();
		}
		const shortcutSettings = await loadShortcutSettings();
		if (!mountedRef.current) return;
		setBindings(getEffectiveShortcutBindings(shortcutSettings.bindings));
	}, []);

	useEffect(() => {
		let cancelled = false;
		let focusRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
		mountedRef.current = true;
		void refresh().catch(() => {});
		const win = getCurrentWindow();
		const unlistenPromise = win.onFocusChanged(({ payload: focused }) => {
			if (!focused || cancelled) return;
			if (focusRefreshTimeout) clearTimeout(focusRefreshTimeout);
			focusRefreshTimeout = setTimeout(() => {
				if (!cancelled) void refresh(true).catch(() => {});
			}, FOCUS_REFRESH_DELAY_MS);
		});
		return () => {
			cancelled = true;
			mountedRef.current = false;
			if (focusRefreshTimeout) clearTimeout(focusRefreshTimeout);
			unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
		};
	}, [refresh]);

	useTauriEvent(
		"settings:updated",
		(payload: { shortcuts?: { bindings?: ShortcutBindings } }) => {
			if (!payload.shortcuts?.bindings) return;
			setBindings(getEffectiveShortcutBindings(payload.shortcuts.bindings));
		},
	);

	const getBinding = useCallback(
		(actionId: ShortcutActionId) => bindings[actionId],
		[bindings],
	);

	const actionsWithBindings = useMemo<
		Array<
			ShortcutActionDefinition & { binding: EffectiveShortcutBindings[string] }
		>
	>(
		() =>
			SHORTCUT_ACTIONS.map((action) => ({
				...action,
				binding: bindings[action.id],
			})),
		[bindings],
	);

	return {
		bindings,
		getBinding,
		actionsWithBindings,
		refresh,
	};
}
