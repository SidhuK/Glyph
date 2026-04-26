import { Component, type ErrorInfo, type ReactNode } from "react";
import { EditorProvider } from "./EditorContext";
import { FileTreeProvider } from "./FileTreeContext";
import { SpaceProvider } from "./SpaceContext";
import { UIProvider } from "./UIContext";
export { useUpdaterContext } from "./UpdaterContext";

export { useSpace } from "./SpaceContext";
export { useFileTreeContext } from "./FileTreeContext";
export { useAISidebarContext, useUILayoutContext } from "./UIContext";
export { useEditorContext, useEditorRegistration } from "./EditorContext";

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
					<UIProvider>
						<EditorProvider>{children}</EditorProvider>
					</UIProvider>
				</FileTreeProvider>
			</SpaceProvider>
		</ProvidersErrorBoundary>
	);
}
