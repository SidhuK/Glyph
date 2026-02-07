import type { ReactNode } from "react";
import { FileTreeProvider } from "./FileTreeContext";
import { UIProvider } from "./UIContext";
import { VaultProvider } from "./VaultContext";
import { ViewProvider } from "./ViewContext";

export { useVault } from "./VaultContext";
export { useFileTreeContext } from "./FileTreeContext";
export { useViewContext } from "./ViewContext";
export { useUIContext } from "./UIContext";

export type { VaultContextValue } from "./VaultContext";
export type { FileTreeContextValue } from "./FileTreeContext";
export type { ViewContextValue } from "./ViewContext";
export type { UIContextValue } from "./UIContext";

export function AppProviders({ children }: { children: ReactNode }) {
	return (
		<VaultProvider>
			<FileTreeProvider>
				<ViewProvider>
					<UIProvider>{children}</UIProvider>
				</ViewProvider>
			</FileTreeProvider>
		</VaultProvider>
	);
}
