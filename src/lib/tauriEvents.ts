import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";

type TauriEventMap = {
	"menu:new_note": undefined;
	"menu:open_daily_note": undefined;
	"menu:save_note": undefined;
	"menu:close_tab": undefined;
	"menu:open_space": undefined;
	"menu:create_space": undefined;
	"menu:close_space": undefined;
	"menu:reveal_space": undefined;
	"menu:open_space_settings": undefined;
	"menu:open_about": undefined;
	"menu:toggle_ai": undefined;
	"menu:close_ai": undefined;
	"menu:ai_attach_current_note": undefined;
	"menu:ai_attach_all_open_notes": undefined;
	"menu:open_ai_settings": undefined;
	"settings:navigate": { tab: "general" | "appearance" | "ai" | "space" | "about" };
	"ai:chunk": { job_id: string; delta: string };
	"ai:status": { job_id: string; status: string; detail?: string };
	"ai:done": { job_id: string; cancelled: boolean };
	"ai:error": { job_id: string; message: string };
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
	"notes:external_changed": { rel_path: string };
	"space:fs_changed": { rel_path: string };
	"settings:updated": {
		ui?: {
			theme?: string;
			accent?:
				| "neutral"
				| "cerulean"
				| "tropical-teal"
				| "light-yellow"
				| "soft-apricot"
				| "vibrant-coral";
			fontFamily?: string;
			monoFontFamily?: string;
			fontSize?: number;
			aiEnabled?: boolean;
			aiAssistantMode?: "chat" | "create";
			aiSidebarWidth?: number | null;
		};
		dailyNotes?: {
			folder?: string | null;
		};
		analytics?: {
			enabled?: boolean;
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
