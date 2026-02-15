import { Component, type ErrorInfo, type ReactNode } from "react";
import { EditorProvider } from "./EditorContext";
import { FileTreeProvider } from "./FileTreeContext";
import { UIProvider } from "./UIContext";
import { VaultProvider } from "./VaultContext";
import { ViewProvider } from "./ViewContext";

export { useVault } from "./VaultContext";
export { useFileTreeContext } from "./FileTreeContext";
export { useViewContext } from "./ViewContext";
export { useUIContext } from "./UIContext";
export {
	useAISidebarContext,
	useSearchUIContext,
	useUILayoutContext,
} from "./UIContext";
export { useEditorContext, useEditorRegistration } from "./EditorContext";

export type { VaultContextValue } from "./VaultContext";
export type { FileTreeContextValue } from "./FileTreeContext";
export type { ViewContextValue } from "./ViewContext";
export type { UIContextValue } from "./UIContext";
export type {
	AISidebarContextValue,
	SearchUIContextValue,
	UILayoutContextValue,
} from "./UIContext";
export type { EditorSaveState } from "./EditorContext";

interface ProvidersErrorBoundaryState {
	hasError: boolean;
}

class ProvidersErrorBoundary extends Component<
	{ children: ReactNode },
	ProvidersErrorBoundaryState
> {
	state: ProvidersErrorBoundaryState = { hasError: false };

	static getDerivedStateFromError(): ProvidersErrorBoundaryState {
		return { hasError: true };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error("AppProviders crashed", error, info);
	}

	render() {
		if (this.state.hasError) {
			return (
				<div className="mainArea mainAreaWelcome">
					<div className="welcomeSurface">
						<h1>Something went wrong</h1>
						<p>Please restart the app window.</p>
					</div>
				</div>
			);
		}
		return this.props.children;
	}
}

export function AppProviders({ children }: { children: ReactNode }) {
	return (
		<ProvidersErrorBoundary>
			<VaultProvider>
				<FileTreeProvider>
					<ViewProvider>
						<UIProvider>
							<EditorProvider>{children}</EditorProvider>
						</UIProvider>
					</ViewProvider>
				</FileTreeProvider>
			</VaultProvider>
		</ProvidersErrorBoundary>
	);
}
