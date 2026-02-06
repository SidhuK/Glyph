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
		let cancelled = false;
		const cleanups: Array<() => void> = [];

		void (async () => {
			const u1 = await listen("menu:open_vault", () => {
				void onOpenVault();
			});
			if (cancelled) {
				u1();
				return;
			}
			cleanups.push(u1);

			const u2 = await listen("menu:create_vault", () => {
				void onCreateVault();
			});
			if (cancelled) {
				u2();
				return;
			}
			cleanups.push(u2);

			const u3 = await listen("menu:close_vault", () => {
				void closeVault();
			});
			if (cancelled) {
				u3();
				return;
			}
			cleanups.push(u3);
		})();

		return () => {
			cancelled = true;
			for (const fn of cleanups) fn();
		};
	}, [closeVault, onCreateVault, onOpenVault]);
}
