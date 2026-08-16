import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import type { DeeplinkErrorPayload, DeeplinkEvent } from "./deeplink";
import type { SettingsUpdatedPayload } from "./settings/model";

type TauriEventMap = {
	"menu:app_command": { command_id: string };
	"menu:open_recent_space": { path: string };
	"app:open_note": { path: string };
	"deeplink:action": DeeplinkEvent;
	"deeplink:error": DeeplinkErrorPayload;
	"external-markdown:close_requested": undefined;
	"git_sync:status": import("./tauri").GitSyncStatus;
	"ai:chunk": { job_id: string; delta: string };
	"ai:status": { job_id: string; status: string; detail?: string };
	"ai:done": { job_id: string; cancelled: boolean };
	"ai:error": { job_id: string; message: string };
	"ai:profiles-updated": undefined;
	"codex:chunk": { job_id: string; delta: string };
	"codex:status": { job_id: string; status: string; detail?: string };
	"codex:done": { job_id: string; cancelled: boolean };
	"codex:error": { job_id: string; message: string };
	"codex:tool": {
		job_id: string;
		tool: string;
		phase: string;
		at_ms?: number;
		call_id?: string;
		payload?: unknown;
		error?: string;
	};
	"ai:tool": {
		job_id: string;
		tool: string;
		phase: string;
		at_ms?: number;
		call_id?: string;
		payload?: unknown;
		error?: string;
	};
	"space:fs_changed": import("./spaceChange").SpaceChange;
	"index:progress": import("./tauri").IndexProgress;
	"settings:updated": SettingsUpdatedPayload;
};

type TauriEventHandler<K extends keyof TauriEventMap> =
	TauriEventMap[K] extends undefined
		? () => void
		: (payload: TauriEventMap[K]) => void;

export async function listenTauriEvent<K extends keyof TauriEventMap>(
	event: K,
	handler: TauriEventHandler<K>,
): Promise<() => void> {
	return listen<TauriEventMap[K]>(event, (evt) => {
		const payload = evt.payload as TauriEventMap[K];
		if (payload === undefined) {
			(handler as () => void)();
			return;
		}
		(handler as (value: TauriEventMap[K]) => void)(payload);
	});
}

function runUnlisten(unlisten: (() => void) | null): void {
	if (!unlisten) return;

	try {
		const result = unlisten() as unknown;
		void Promise.resolve(result).catch(() => {
			// Tauri may already have cleaned up the listener during window teardown.
		});
	} catch {
		// Ignore teardown races from Tauri listener cleanup.
	}
}

export function useTauriEvent<K extends keyof TauriEventMap>(
	event: K,
	handler: TauriEventHandler<K>,
	onListening?: () => void,
): void {
	const handlerRef = useRef(handler);
	handlerRef.current = handler;
	const onListeningRef = useRef(onListening);
	onListeningRef.current = onListening;

	useEffect(() => {
		let cancelled = false;
		let unlisten: (() => void) | null = null;
		let didUnlisten = false;
		let pendingTeardown = false;

		const cleanup = () => {
			if (didUnlisten) return;
			if (unlisten) {
				runUnlisten(unlisten);
				unlisten = null;
				didUnlisten = true;
				pendingTeardown = false;
				return;
			}
			pendingTeardown = true;
		};

		void (async () => {
			const stop = await listen<TauriEventMap[K]>(event, (evt) => {
				const payload = evt.payload as TauriEventMap[K];
				if (payload === undefined) {
					(handlerRef.current as () => void)();
					return;
				}
				(handlerRef.current as (value: TauriEventMap[K]) => void)(payload);
			});
			if (cancelled) {
				unlisten = stop;
				cleanup();
				return;
			}
			unlisten = stop;
			onListeningRef.current?.();
			if (pendingTeardown && !didUnlisten) {
				runUnlisten(unlisten);
				unlisten = null;
				didUnlisten = true;
				pendingTeardown = false;
			}
		})();

		return () => {
			cancelled = true;
			cleanup();
		};
	}, [event]);
}
