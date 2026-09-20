import "./App.css";
import { DragDropProvider } from "@dnd-kit/react";
import { LazyMotion, domAnimation } from "motion/react";
import { AIConversationProvider } from "./components/ai/hooks/useRigChat";
import { AppShell } from "./components/app/AppShell";
import { LicenseGate } from "./components/licensing/LicenseGate";
import { AppProviders, useSpace } from "./contexts";

function LicensedApp() {
	const { spacePath } = useSpace();
	return (
		<AIConversationProvider key={spacePath ?? ""}>
			<DragDropProvider>
				<AppShell />
			</DragDropProvider>
		</AIConversationProvider>
	);
}

function App() {
	return (
		<LazyMotion features={domAnimation}>
			<AppProviders>
				<LicenseGate>
					<LicensedApp />
				</LicenseGate>
			</AppProviders>
		</LazyMotion>
	);
}

export default App;
