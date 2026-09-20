import "./App.css";
import { DragDropProvider } from "@dnd-kit/react";
import { LazyMotion, domAnimation } from "motion/react";
import { AIConversationProvider } from "./components/ai/hooks/useRigChat";
import { AppShell } from "./components/app/AppShell";
import { LicenseGate } from "./components/licensing/LicenseGate";
import { AppProviders } from "./contexts";

function App() {
	return (
		<LazyMotion features={domAnimation}>
			<AppProviders>
				<AIConversationProvider>
					<LicenseGate>
						<DragDropProvider>
							<AppShell />
						</DragDropProvider>
					</LicenseGate>
				</AIConversationProvider>
			</AppProviders>
		</LazyMotion>
	);
}

export default App;
