import { useCallback } from "react";
import { useUILayoutContext } from "../contexts";
import { dispatchAppCommand } from "../lib/commands/commandDispatcher";
import { useTauriEvent } from "../lib/tauriEvents";

interface UseMenuListenersProps {
	onNewNote: () => void;
	onCreateFromTemplate: () => void;
	onOpenDailyNote: () => void;
	onSaveNote: () => void;
	onExportHtml: () => void;
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
	onCloseAiPane: () => void;
	onAttachCurrentNoteToAi: () => void;
	onAttachAllOpenNotesToAi: () => void;
	onOpenAiSettings: () => void;
	onEditorAction: (action: string) => void;
}

export function useMenuListeners({
	onNewNote,
	onCreateFromTemplate,
	onOpenDailyNote,
	onSaveNote,
	onExportHtml,
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
	onCloseAiPane,
	onAttachCurrentNoteToAi,
	onAttachAllOpenNotesToAi,
	onOpenAiSettings,
	onEditorAction,
}: UseMenuListenersProps): void {
	const { openSettings } = useUILayoutContext();
	const handleNewNote = useCallback(() => {
		onNewNote();
	}, [onNewNote]);
	const handleCreateFromTemplate = useCallback(() => {
		onCreateFromTemplate();
	}, [onCreateFromTemplate]);
	const handleOpenDailyNote = useCallback(() => {
		onOpenDailyNote();
	}, [onOpenDailyNote]);
	const handleSaveNote = useCallback(() => {
		onSaveNote();
	}, [onSaveNote]);
	const handleExportHtml = useCallback(() => {
		onExportHtml();
	}, [onExportHtml]);
	const handleCloseTab = useCallback(() => {
		onCloseTab();
	}, [onCloseTab]);
	const handleOpenSpace = useCallback(() => {
		void onOpenSpace();
	}, [onOpenSpace]);
	const handleOpenRecentSpace = useCallback(
		(payload: { path: string }) => {
			void onOpenRecentSpaceAtPath(payload.path);
		},
		[onOpenRecentSpaceAtPath],
	);
	const handleCreateSpace = useCallback(() => {
		void onCreateSpace();
	}, [onCreateSpace]);
	const handleCloseSpace = useCallback(() => {
		void closeSpace();
	}, [closeSpace]);
	const handleRevealSpace = useCallback(() => {
		onRevealSpace();
	}, [onRevealSpace]);
	const handleOpenSpaceSettings = useCallback(() => {
		onOpenSpaceSettings();
	}, [onOpenSpaceSettings]);
	const handleGitSyncNow = useCallback(() => {
		onGitSyncNow();
	}, [onGitSyncNow]);
	const handleOpenGitSettings = useCallback(() => {
		onOpenGitSettings();
	}, [onOpenGitSettings]);
	const handleOpenAbout = useCallback(() => {
		openSettings("about");
	}, [openSettings]);
	const handleOpenSettings = useCallback(() => {
		openSettings();
	}, [openSettings]);
	const handleToggleAi = useCallback(() => {
		onToggleAiPane();
	}, [onToggleAiPane]);
	const handleCloseAi = useCallback(() => {
		onCloseAiPane();
	}, [onCloseAiPane]);
	const handleAttachCurrentNote = useCallback(() => {
		onAttachCurrentNoteToAi();
	}, [onAttachCurrentNoteToAi]);
	const handleAttachAllOpenNotes = useCallback(() => {
		onAttachAllOpenNotesToAi();
	}, [onAttachAllOpenNotesToAi]);
	const handleOpenAiSettings = useCallback(() => {
		onOpenAiSettings();
	}, [onOpenAiSettings]);
	const handleEditorAction = useCallback(
		(payload: { action: string }) => {
			onEditorAction(payload.action);
		},
		[onEditorAction],
	);
	const handleAppCommand = useCallback(
		(payload: { command_id: string }) => {
			dispatchAppCommand(payload.command_id, {
				"new-note": onNewNote,
				"create-from-template": onCreateFromTemplate,
				"open-daily-note": onOpenDailyNote,
				"save-note": onSaveNote,
				"export-note-html": onExportHtml,
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
				"toggle-ai": onToggleAiPane,
				"close-ai-pane": onCloseAiPane,
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
			});
		},
		[
			closeSpace,
			onAttachAllOpenNotesToAi,
			onAttachCurrentNoteToAi,
			onCloseAiPane,
			onCloseTab,
			onCreateFromTemplate,
			onCreateSpace,
			onEditorAction,
			onExportHtml,
			onGitSyncNow,
			onNewNote,
			onOpenAiSettings,
			onOpenDailyNote,
			onOpenGitSettings,
			onOpenSpace,
			onOpenSpaceSettings,
			onRevealSpace,
			onSaveNote,
			onToggleAiPane,
			openSettings,
		],
	);

	useTauriEvent("menu:app_command", handleAppCommand);
	useTauriEvent("menu:new_note", handleNewNote);
	useTauriEvent("menu:create_from_template", handleCreateFromTemplate);
	useTauriEvent("menu:open_daily_note", handleOpenDailyNote);
	useTauriEvent("menu:save_note", handleSaveNote);
	useTauriEvent("menu:export_html", handleExportHtml);
	useTauriEvent("menu:close_tab", handleCloseTab);
	useTauriEvent("menu:open_space", handleOpenSpace);
	useTauriEvent("menu:open_recent_space", handleOpenRecentSpace);
	useTauriEvent("menu:create_space", handleCreateSpace);
	useTauriEvent("menu:close_space", handleCloseSpace);
	useTauriEvent("menu:reveal_space", handleRevealSpace);
	useTauriEvent("menu:open_space_settings", handleOpenSpaceSettings);
	useTauriEvent("menu:git_sync_now", handleGitSyncNow);
	useTauriEvent("menu:open_git_settings", handleOpenGitSettings);
	useTauriEvent("menu:open_about", handleOpenAbout);
	useTauriEvent("menu:open_settings", handleOpenSettings);
	useTauriEvent("menu:toggle_ai", handleToggleAi);
	useTauriEvent("menu:close_ai", handleCloseAi);
	useTauriEvent("menu:ai_attach_current_note", handleAttachCurrentNote);
	useTauriEvent("menu:ai_attach_all_open_notes", handleAttachAllOpenNotes);
	useTauriEvent("menu:open_ai_settings", handleOpenAiSettings);
	useTauriEvent("menu:editor_action", handleEditorAction);
}
