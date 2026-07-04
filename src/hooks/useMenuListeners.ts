import { useCallback, useMemo } from "react";
import { useUILayoutContext } from "../contexts";
import { dispatchAppCommand } from "../lib/commands/commandDispatcher";
import { buildHelpMenuCommandHandlers } from "../lib/helpMenu";
import { useTauriEvent } from "../lib/tauriEvents";

interface UseMenuListenersProps {
	onNewNote: () => void;
	onCreateFromTemplate: () => void;
	onOpenDailyNote: () => void;
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
	openGettingStarted: () => void;
	showWelcomeNote: () => void | Promise<void>;
}

export function useMenuListeners({
	onNewNote,
	onCreateFromTemplate,
	onOpenDailyNote,
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
	openGettingStarted,
	showWelcomeNote,
}: UseMenuListenersProps): void {
	const { openSettings } = useUILayoutContext();
	const helpMenuCommandHandlers = useMemo(
		() =>
			buildHelpMenuCommandHandlers(
				openGettingStarted,
				showWelcomeNote,
				openSettings,
			),
		[openGettingStarted, openSettings, showWelcomeNote],
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
				"open-daily-note": onOpenDailyNote,
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
			onNewNote,
			onOpenAiSettings,
			onOpenDailyNote,
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

	useTauriEvent("menu:app_command", handleAppCommand);
	useTauriEvent("menu:open_recent_space", handleOpenRecentSpace);
}
