import { useCallback, useMemo, useRef } from "react";
import { useUILayoutContext } from "../contexts";
import { dispatchAppCommand } from "../lib/commands/commandDispatcher";
import { extractErrorMessage } from "../lib/errorUtils";
import { buildHelpMenuCommandHandlers } from "../lib/helpMenu";
import type { PeriodKind } from "../lib/periodNotes";
import { invoke } from "../lib/tauri";
import { useTauriEvent } from "../lib/tauriEvents";
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

interface AppMenuCommand {
	command_id: string;
}

const EDITOR_MENU_COMMANDS = [
	"bold",
	"italic",
	"underline",
	"strikethrough",
	"link_set",
	"link_clear",
	"heading_1",
	"heading_2",
	"heading_3",
	"collapse_all_headings",
	"expand_all_headings",
	"bullet_list",
	"numbered_list",
	"todo_list",
	"quote",
	"code_block",
	"mermaid_chart",
	"table",
	"divider",
	"details_block",
	"callout_info",
	"callout_warning",
	"callout_error",
	"callout_success",
	"callout_tip",
	"color_gray",
	"color_brown",
	"color_orange",
	"color_yellow",
	"color_green",
	"color_blue",
	"color_purple",
	"color_red",
	"color_clear",
	"highlight_yellow",
	"highlight_blue",
	"highlight_green",
	"highlight_red",
	"highlight_clear",
	"paste_without_formatting",
] as const;

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
		(payload: AppMenuCommand) => {
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
				...Object.fromEntries(
					EDITOR_MENU_COMMANDS.map((commandId) => [
						commandId,
						() => onEditorAction(commandId),
					]),
				),
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
	const replayingPendingCommandsRef = useRef(true);
	const bufferedLiveCommandsRef = useRef<AppMenuCommand[]>([]);
	const handleMenuCommand = useCallback(
		(command: AppMenuCommand) => {
			if (replayingPendingCommandsRef.current) {
				bufferedLiveCommandsRef.current.push(command);
				return;
			}
			handleAppCommand(command);
		},
		[handleAppCommand],
	);

	const replayPendingMenuCommands = useCallback(() => {
		let cancelled = false;
		void invoke("menu_take_pending_commands")
			.then((commands) => {
				if (cancelled) return;
				for (const command of commands) handleAppCommand(command);
				for (const command of bufferedLiveCommandsRef.current) {
					handleAppCommand(command);
				}
				bufferedLiveCommandsRef.current = [];
				replayingPendingCommandsRef.current = false;
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				replayingPendingCommandsRef.current = false;
				console.error("Failed to replay pending menu commands", error);
				toast.error(extractErrorMessage(error));
			});
		return () => {
			cancelled = true;
		};
	}, [handleAppCommand]);

	useTauriEvent(
		"menu:app_command",
		handleMenuCommand,
		replayPendingMenuCommands,
	);
	useTauriEvent("menu:open_recent_space", handleOpenRecentSpace);
}
