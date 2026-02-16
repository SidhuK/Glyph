import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";

export type TauriEventMap = {
	"menu:open_vault": undefined;
	"menu:create_vault": undefined;
	"menu:close_vault": undefined;
	"ai:chunk": { job_id: string; delta: string };
	"ai:status": { job_id: string; status: string; detail?: string };
	"ai:done": { job_id: string; cancelled: boolean };
	"ai:error": { job_id: string; message: string };
	"ai:tool": {
		job_id: string;
		tool: string;
		phase: string;
		at_ms?: number;
		call_id?: string;
		payload?: unknown;
		error?: string;
	};
	"notes:external_changed": { rel_path: string };
	"vault:fs_changed": { rel_path: string };
	"settings:updated": {
		ui?: {
			theme?: string;
			fontFamily?: string;
			monoFontFamily?: string;
			fontSize?: number;
			aiAssistantMode?: "chat" | "create";
			aiSidebarWidth?: number | null;
			showBreadcrumbs?: boolean;
		};
		dailyNotes?: {
			folder?: string | null;
		};
	};
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

export function useTauriEvent<K extends keyof TauriEventMap>(
	event: K,
	handler: TauriEventHandler<K>,
): void {
	const handlerRef = useRef(handler);
	handlerRef.current = handler;

	useEffect(() => {
		let cancelled = false;
		let unlisten: (() => void) | null = null;

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
				stop();
				return;
			}
			unlisten = stop;
		})();

		return () => {
			cancelled = true;
			unlisten?.();
		};
	}, [event]);
}
