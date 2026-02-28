import { Component, type ErrorInfo, type ReactNode } from "react";
import { EditorProvider } from "./EditorContext";
import { FileTreeProvider } from "./FileTreeContext";
import { SpaceProvider } from "./SpaceContext";
import { UIProvider } from "./UIContext";
import { ViewProvider } from "./ViewContext";

export { useSpace } from "./SpaceContext";
export { useFileTreeContext } from "./FileTreeContext";
export { useViewContext } from "./ViewContext";
export { useUIContext } from "./UIContext";
export {
	useAISidebarContext,
	useSearchUIContext,
	useUILayoutContext,
} from "./UIContext";
export { useEditorContext, useEditorRegistration } from "./EditorContext";

export type { SpaceContextValue } from "./SpaceContext";
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
			<SpaceProvider>
				<FileTreeProvider>
					<ViewProvider>
						<UIProvider>
							<EditorProvider>{children}</EditorProvider>
						</UIProvider>
					</ViewProvider>
				</FileTreeProvider>
			</SpaceProvider>
		</ProvidersErrorBoundary>
	);
}
