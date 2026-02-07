import { useCallback } from "react";
import { useTauriEvent } from "../lib/tauriEvents";

export interface UseMenuListenersProps {
	onOpenVault: () => void;
	onCreateVault: () => void;
	closeVault: () => Promise<void>;
}

export function useMenuListeners({
	onOpenVault,
	onCreateVault,
	closeVault,
}: UseMenuListenersProps): void {
	const handleOpenVault = useCallback(() => {
		void onOpenVault();
	}, [onOpenVault]);
	const handleCreateVault = useCallback(() => {
		void onCreateVault();
	}, [onCreateVault]);
	const handleCloseVault = useCallback(() => {
		void closeVault();
	}, [closeVault]);

	useTauriEvent("menu:open_vault", handleOpenVault);
	useTauriEvent("menu:create_vault", handleCreateVault);
	useTauriEvent("menu:close_vault", handleCloseVault);
}
