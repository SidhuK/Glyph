import { useCallback, useEffect, useMemo } from "react";
import { useUILayoutContext } from "../contexts";
import { dispatchAppCommand } from "../lib/commands/commandDispatcher";
import { extractErrorMessage } from "../lib/errorUtils";
import { buildHelpMenuCommandHandlers } from "../lib/helpMenu";
import type { PeriodKind } from "../lib/periodNotes";
import { invoke } from "../lib/tauri";
import { listenTauriEvent, useTauriEvent } from "../lib/tauriEvents";
import { toast } from "../lib/toast";

interface UseMenuListenersProps {
	onNewNote: () => void;
	onCreateFromTemplate: () => void;
	onImportFiles: () => void;
	onImportFolder: () => void;
	onOpenPeriodNote: (kind: PeriodKind) => void;
	onSaveNote: () => void;
	onPrintNote: () => void;
	onCloseTab: () => void;
	onOpenSpace: () => void;
	onOpenRecentSpaceAtPath: (path: string) => void | Promise<void>;
	onCreateSpace: () => void;
	closeSpace: () => Promise<void>;
	onRevealSpace: () => void;
	onOpenSpaceSettings: () => void;
	onGitSyncNow: () => void;
	onOpenGitSettings: () => void;
	onToggleAiPane: () => void;
	onAttachCurrentNoteToAi: () => void;
	onAttachAllOpenNotesToAi: () => void;
	onOpenAiSettings: () => void;
	onEditorAction: (action: string) => void;
}

export function useMenuListeners({
	onNewNote,
	onCreateFromTemplate,
	onImportFiles,
	onImportFolder,
	onOpenPeriodNote,
	onSaveNote,
	onPrintNote,
	onCloseTab,
	onOpenSpace,
	onOpenRecentSpaceAtPath,
	onCreateSpace,
	closeSpace,
	onRevealSpace,
	onOpenSpaceSettings,
	onGitSyncNow,
	onOpenGitSettings,
	onToggleAiPane,
	onAttachCurrentNoteToAi,
	onAttachAllOpenNotesToAi,
	onOpenAiSettings,
	onEditorAction,
}: UseMenuListenersProps): void {
	const { openSettings } = useUILayoutContext();
	const helpMenuCommandHandlers = useMemo(
		() => buildHelpMenuCommandHandlers(openSettings),
		[openSettings],
	);
	const handleOpenRecentSpace = useCallback(
		(payload: { path: string }) => {
			void onOpenRecentSpaceAtPath(payload.path);
		},
		[onOpenRecentSpaceAtPath],
	);
	const handleAppCommand = useCallback(
		(payload: { command_id: string }) => {
			void dispatchAppCommand(payload.command_id, {
				"new-note": onNewNote,
				"create-from-template": onCreateFromTemplate,
				"import-files": onImportFiles,
				"import-folder": onImportFolder,
				"open-daily-note": () => onOpenPeriodNote("day"),
				"open-weekly-note": () => onOpenPeriodNote("week"),
				"open-monthly-note": () => onOpenPeriodNote("month"),
				"open-quarterly-note": () => onOpenPeriodNote("quarter"),
				"save-note": onSaveNote,
				"print-note": onPrintNote,
				"close-active-tab": onCloseTab,
				"open-space": onOpenSpace,
				"create-space": onCreateSpace,
				"close-space": closeSpace,
				"reveal-space": onRevealSpace,
				"open-space-settings": onOpenSpaceSettings,
				"git-sync-now": onGitSyncNow,
				"open-git-sync-settings": onOpenGitSettings,
				"open-about": () => openSettings("about"),
				"open-settings": () => openSettings(),
				...helpMenuCommandHandlers,
				"toggle-ai": onToggleAiPane,
				"ai-attach-current-note": onAttachCurrentNoteToAi,
				"ai-attach-all-open-notes": onAttachAllOpenNotesToAi,
				"open-ai-settings": onOpenAiSettings,
				bold: () => onEditorAction("bold"),
				italic: () => onEditorAction("italic"),
				underline: () => onEditorAction("underline"),
				strikethrough: () => onEditorAction("strikethrough"),
				link_set: () => onEditorAction("link_set"),
				link_clear: () => onEditorAction("link_clear"),
				heading_1: () => onEditorAction("heading_1"),
				heading_2: () => onEditorAction("heading_2"),
				heading_3: () => onEditorAction("heading_3"),
				collapse_all_headings: () => onEditorAction("collapse_all_headings"),
				expand_all_headings: () => onEditorAction("expand_all_headings"),
				bullet_list: () => onEditorAction("bullet_list"),
				numbered_list: () => onEditorAction("numbered_list"),
				todo_list: () => onEditorAction("todo_list"),
				quote: () => onEditorAction("quote"),
				code_block: () => onEditorAction("code_block"),
				mermaid_chart: () => onEditorAction("mermaid_chart"),
				table: () => onEditorAction("table"),
				divider: () => onEditorAction("divider"),
				details_block: () => onEditorAction("details_block"),
				callout_info: () => onEditorAction("callout_info"),
				callout_warning: () => onEditorAction("callout_warning"),
				callout_error: () => onEditorAction("callout_error"),
				callout_success: () => onEditorAction("callout_success"),
				callout_tip: () => onEditorAction("callout_tip"),
				color_gray: () => onEditorAction("color_gray"),
				color_brown: () => onEditorAction("color_brown"),
				color_orange: () => onEditorAction("color_orange"),
				color_yellow: () => onEditorAction("color_yellow"),
				color_green: () => onEditorAction("color_green"),
				color_blue: () => onEditorAction("color_blue"),
				color_purple: () => onEditorAction("color_purple"),
				color_red: () => onEditorAction("color_red"),
				color_clear: () => onEditorAction("color_clear"),
				highlight_yellow: () => onEditorAction("highlight_yellow"),
				highlight_blue: () => onEditorAction("highlight_blue"),
				highlight_green: () => onEditorAction("highlight_green"),
				highlight_red: () => onEditorAction("highlight_red"),
				highlight_clear: () => onEditorAction("highlight_clear"),
				paste_without_formatting: () =>
					onEditorAction("paste_without_formatting"),
			})
				.then((handled) => {
					if (!handled) {
						console.warn(
							`[useMenuListeners] command "${payload.command_id}" has no handler`,
						);
					}
				})
				.catch((error) => {
					console.error(
						`[useMenuListeners] command "${payload.command_id}" failed:`,
						error,
					);
				});
		},
		[
			closeSpace,
			helpMenuCommandHandlers,
			onAttachAllOpenNotesToAi,
			onAttachCurrentNoteToAi,
			onCloseTab,
			onCreateFromTemplate,
			onCreateSpace,
			onEditorAction,
			onGitSyncNow,
			onImportFiles,
			onImportFolder,
			onNewNote,
			onOpenAiSettings,
			onOpenPeriodNote,
			onOpenGitSettings,
			onOpenSpace,
			onOpenSpaceSettings,
			onPrintNote,
			onRevealSpace,
			onSaveNote,
			onToggleAiPane,
			openSettings,
		],
	);

	useTauriEvent("menu:open_recent_space", handleOpenRecentSpace);

	useEffect(() => {
		let cancelled = false;
		let unlisten: (() => void) | null = null;

		void listenTauriEvent("menu:app_command", handleAppCommand)
			.then(async (stop) => {
				unlisten = stop;
				if (cancelled) {
					stop();
					return;
				}

				const commands = await invoke("menu_take_pending_commands");
				if (cancelled) return;
				for (const command of commands) {
					handleAppCommand(command);
				}
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				console.error("Failed to replay pending menu commands", error);
				toast.error(extractErrorMessage(error));
			});

		return () => {
			cancelled = true;
			unlisten?.();
		};
	}, [handleAppCommand]);
}
