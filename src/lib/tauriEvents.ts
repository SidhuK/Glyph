import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import type {
	AttachmentStorageMode,
	AutoUpdateCheckInterval,
	EditorWidthMode,
	UiAccent,
} from "./settings";
import type { UiDarkThemeId, UiLightThemeId } from "./uiThemes";

type TauriEventMap = {
	"menu:app_command": { command_id: string };
	"menu:new_note": undefined;
	"menu:create_from_template": undefined;
	"menu:open_daily_note": undefined;
	"menu:save_note": undefined;
	"menu:close_tab": undefined;
	"menu:open_space": undefined;
	"menu:open_recent_space": { path: string };
	"menu:create_space": undefined;
	"menu:close_space": undefined;
	"menu:reveal_space": undefined;
	"menu:open_space_settings": undefined;
	"menu:git_sync_now": undefined;
	"menu:open_git_settings": undefined;
	"menu:open_about": undefined;
	"menu:open_settings": undefined;
	"menu:toggle_ai": undefined;
	"menu:ai_attach_current_note": undefined;
	"menu:ai_attach_all_open_notes": undefined;
	"menu:open_ai_settings": undefined;
	"menu:editor_action": { action: string };
	"quick-note:open_note": { path: string };
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
	"notes:external_changed": { rel_path: string; removed: boolean };
	"space:fs_changed": { rel_path: string; removed: boolean };
	"settings:updated": {
		ui?: {
			theme?: string;
			autoUpdateCheckInterval?: AutoUpdateCheckInterval;
			lightThemeId?: UiLightThemeId;
			darkThemeId?: UiDarkThemeId;
			accent?: UiAccent;
			fontFamily?: string;
			monoFontFamily?: string;
			fontSize?: number;
			editorFontSize?: number;
			translucentApp?: boolean;
			showToc?: boolean;
			showFileTreeFolderCounts?: boolean;
			folioMode?: boolean;
			aiEnabled?: boolean;
			aiAssistantMode?: "chat" | "create";
		};
		dailyNotes?: {
			folder?: string | null;
		};
		quickNotes?: {
			folder?: string;
		};
		templates?: {
			folder?: string | null;
			dailyNoteTemplate?: string | null;
		};
		tasks?: {
			source?: { mode?: "space" | "folders"; folders?: string[] };
		};
		database?: {
			showColumnColor?: boolean;
		};
		editor?: {
			showCollapsibleHeadings?: boolean;
			showFrontmatterInEditor?: boolean;
			colorfulHeadings?: boolean;
			editorWidthMode?: EditorWidthMode;
			attachmentStorageMode?: AttachmentStorageMode;
			attachmentFolder?: string | null;
			enablePeopleMentionsAsTags?: boolean;
			vimKeybindings?: boolean;
		};
		shortcuts?: {
			bindings?: Partial<
				Record<
					string,
					{
						key: string;
						meta?: boolean;
						ctrl?: boolean;
						alt?: boolean;
						shift?: boolean;
					} | null
				>
			>;
		};
		onboarding?: {
			launcherSeen?: boolean;
			starterDismissed?: boolean;
			createdFirstNote?: boolean;
			usedCommandPalette?: boolean;
			openedDailyNote?: boolean;
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
): void {
	const handlerRef = useRef(handler);
	handlerRef.current = handler;

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
