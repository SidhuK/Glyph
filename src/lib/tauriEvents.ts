import { type UnlistenFn, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef } from "react";
import type { EditorViewMode } from "./editorMode";
import type {
	AppLanguage,
	AttachmentStorageMode,
	AutoUpdateCheckInterval,
	DateDisplayFormat,
	EditorWidthMode,
	FileTreeSortMode,
	FocusMode,
	ReleaseChannel,
	UiAccent,
	UiCornerRadiusStyle,
} from "./settings";
import type { UiThemeColorOverridesPatch } from "./themeColors";
import type { UiDarkThemeId, UiLightThemeId } from "./uiThemes";

type TauriEventMap = {
	"menu:app_command": { command_id: string };
	"menu:open_recent_space": { path: string };
	"quick-note:open_note": { path: string };
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
	"notes:external_changed": {
		space_path?: string;
		rel_path: string;
		removed: boolean;
	};
	"space:fs_changed": {
		space_path?: string;
		rel_path: string;
		removed: boolean;
	};
	"index:progress": import("./tauri").IndexProgress;
	"settings:updated": {
		spacePath?: string;
		ui?: {
			theme?: string;
			autoUpdateCheckInterval?: AutoUpdateCheckInterval;
			releaseChannel?: ReleaseChannel;
			lightThemeId?: UiLightThemeId;
			darkThemeId?: UiDarkThemeId;
			accent?: UiAccent;
			themeColors?: UiThemeColorOverridesPatch;
			fontFamily?: string;
			editorFontFamily?: string;
			monoFontFamily?: string;
			fontSize?: number;
			editorFontSize?: number;
			translucentApp?: boolean;
			cornerRadiusStyle?: UiCornerRadiusStyle;
			showToc?: boolean;
			showFileTreeFolderCounts?: boolean;
			showNonMarkdownFiles?: boolean;
			fileTreeSortMode?: FileTreeSortMode;
			folioMode?: boolean;
			classicAllNotesByDefault?: boolean;
			resumeLastSession?: boolean;
			aiEnabled?: boolean;
			aiAssistantMode?: "chat" | "create";
			language?: AppLanguage;
			dateDisplayFormat?: DateDisplayFormat;
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
		database?: {
			showColumnColor?: boolean;
		};
		editor?: {
			showCollapsibleHeadings?: boolean;
			showCollapsibleLists?: boolean;
			showFrontmatterInEditor?: boolean;
			colorfulHeadings?: boolean;
			beautifulTags?: boolean;
			editorWidthMode?: EditorWidthMode;
			defaultEditorMode?: EditorViewMode;
			attachmentStorageMode?: AttachmentStorageMode;
			attachmentFolder?: string | null;
			enablePeopleMentionsAsTags?: boolean;
			rawMarkdownVimMode?: boolean;
			spellCheck?: boolean;
			focusMode?: FocusMode;
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

/**
 * Safely invoke a Tauri UnlistenFn.
 *
 * Unlisten can reject when the listener was already removed (window teardown,
 * double-cleanup, HMR). Call sites must not leave that rejection unhandled.
 */
export function safeUnlisten(
	unlisten: UnlistenFn | (() => void) | null | undefined,
): void {
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

/**
 * Listen for the current window gaining/losing focus.
 *
 * Prefer this over `Window.onFocusChanged`. Tauri's helper returns a sync
 * unlisten that fire-and-forgets two async unlistens, which surfaces as
 * unhandled rejections (`listeners[eventId].handlerId`) on teardown.
 */
export async function listenWindowFocusChanged(
	handler: (focused: boolean) => void,
): Promise<UnlistenFn> {
	const win = getCurrentWindow();
	const unlistenFocus = await win.listen("tauri://focus", () => {
		handler(true);
	});
	let unlistenBlur: UnlistenFn;
	try {
		unlistenBlur = await win.listen("tauri://blur", () => {
			handler(false);
		});
	} catch (error) {
		safeUnlisten(unlistenFocus);
		throw error;
	}

	let didUnlisten = false;
	return () => {
		if (didUnlisten) return;
		didUnlisten = true;
		safeUnlisten(unlistenFocus);
		safeUnlisten(unlistenBlur);
	};
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
				safeUnlisten(unlisten);
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
				safeUnlisten(unlisten);
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
