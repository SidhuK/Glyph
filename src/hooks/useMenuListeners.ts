import { openSettingsWindow } from "../lib/windows";
import { useCallback } from "react";
import { useTauriEvent } from "../lib/tauriEvents";

export interface UseMenuListenersProps {
	onOpenSpace: () => void;
	onCreateSpace: () => void;
	closeSpace: () => Promise<void>;
}

export function useMenuListeners({
	onOpenSpace,
	onCreateSpace,
	closeSpace,
}: UseMenuListenersProps): void {
	const handleOpenSpace = useCallback(() => {
		void onOpenSpace();
	}, [onOpenSpace]);
	const handleCreateSpace = useCallback(() => {
		void onCreateSpace();
	}, [onCreateSpace]);
	const handleCloseSpace = useCallback(() => {
		void closeSpace();
	}, [closeSpace]);
	const handleOpenAbout = useCallback(() => {
		void openSettingsWindow("about");
	}, []);

	useTauriEvent("menu:open_space", handleOpenSpace);
	useTauriEvent("menu:create_space", handleCreateSpace);
	useTauriEvent("menu:close_space", handleCloseSpace);
	useTauriEvent("menu:open_about", handleOpenAbout);
}
