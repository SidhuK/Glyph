import { useCallback } from "react";
import { useUILayoutContext } from "../contexts";
import { useTauriEvent } from "../lib/tauriEvents";

export interface UseMenuListenersProps {
	onNewNote: () => void;
	onCreateFromTemplate: () => void;
	onOpenDailyNote: () => void;
	onSaveNote: () => void;
	onExportHtml: () => void;
	onCloseTab: () => void;
	onOpenSpace: () => void;
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
}

export function useMenuListeners({
	onNewNote,
	onCreateFromTemplate,
	onOpenDailyNote,
	onSaveNote,
	onExportHtml,
	onCloseTab,
	onOpenSpace,
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

	useTauriEvent("menu:new_note", handleNewNote);
	useTauriEvent("menu:create_from_template", handleCreateFromTemplate);
	useTauriEvent("menu:open_daily_note", handleOpenDailyNote);
	useTauriEvent("menu:save_note", handleSaveNote);
	useTauriEvent("menu:export_html", handleExportHtml);
	useTauriEvent("menu:close_tab", handleCloseTab);
	useTauriEvent("menu:open_space", handleOpenSpace);
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
}
