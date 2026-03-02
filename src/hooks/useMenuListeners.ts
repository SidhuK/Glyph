import { openSettingsWindow } from "../lib/windows";
import { useCallback } from "react";
import { useTauriEvent } from "../lib/tauriEvents";

export interface UseMenuListenersProps {
	onNewNote: () => void;
	onOpenDailyNote: () => void;
	onSaveNote: () => void;
	onCloseTab: () => void;
	onOpenSpace: () => void;
	onCreateSpace: () => void;
	closeSpace: () => Promise<void>;
	onRevealSpace: () => void;
	onOpenSpaceSettings: () => void;
	onToggleAiPane: () => void;
	onCloseAiPane: () => void;
	onAttachCurrentNoteToAi: () => void;
	onAttachAllOpenNotesToAi: () => void;
	onOpenAiSettings: () => void;
}

export function useMenuListeners({
	onNewNote,
	onOpenDailyNote,
	onSaveNote,
	onCloseTab,
	onOpenSpace,
	onCreateSpace,
	closeSpace,
	onRevealSpace,
	onOpenSpaceSettings,
	onToggleAiPane,
	onCloseAiPane,
	onAttachCurrentNoteToAi,
	onAttachAllOpenNotesToAi,
	onOpenAiSettings,
}: UseMenuListenersProps): void {
	const handleNewNote = useCallback(() => {
		onNewNote();
	}, [onNewNote]);
	const handleOpenDailyNote = useCallback(() => {
		onOpenDailyNote();
	}, [onOpenDailyNote]);
	const handleSaveNote = useCallback(() => {
		onSaveNote();
	}, [onSaveNote]);
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
	const handleOpenAbout = useCallback(() => {
		void openSettingsWindow("about");
	}, []);
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
	useTauriEvent("menu:open_daily_note", handleOpenDailyNote);
	useTauriEvent("menu:save_note", handleSaveNote);
	useTauriEvent("menu:close_tab", handleCloseTab);
	useTauriEvent("menu:open_space", handleOpenSpace);
	useTauriEvent("menu:create_space", handleCreateSpace);
	useTauriEvent("menu:close_space", handleCloseSpace);
	useTauriEvent("menu:reveal_space", handleRevealSpace);
	useTauriEvent("menu:open_space_settings", handleOpenSpaceSettings);
	useTauriEvent("menu:open_about", handleOpenAbout);
	useTauriEvent("menu:toggle_ai", handleToggleAi);
	useTauriEvent("menu:close_ai", handleCloseAi);
	useTauriEvent("menu:ai_attach_current_note", handleAttachCurrentNote);
	useTauriEvent("menu:ai_attach_all_open_notes", handleAttachAllOpenNotes);
	useTauriEvent("menu:open_ai_settings", handleOpenAiSettings);
}
