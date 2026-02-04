import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

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
	useEffect(() => {
		let unlistenOpen: (() => void) | null = null;
		let unlistenCreate: (() => void) | null = null;
		let unlistenClose: (() => void) | null = null;

		void (async () => {
			unlistenOpen = await listen("menu:open_vault", () => {
				void onOpenVault();
			});
			unlistenCreate = await listen("menu:create_vault", () => {
				void onCreateVault();
			});
			unlistenClose = await listen("menu:close_vault", () => {
				void closeVault();
			});
		})();

		return () => {
			unlistenOpen?.();
			unlistenCreate?.();
			unlistenClose?.();
		};
	}, [closeVault, onCreateVault, onOpenVault]);
}
