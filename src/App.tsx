import "./App.css";
import { DragDropProvider } from "@dnd-kit/react";
import { LazyMotion, domAnimation } from "motion/react";
import { AppShell } from "./components/app/AppShell";
import { LicenseGate } from "./components/licensing/LicenseGate";
import { AppProviders } from "./contexts";

function App() {
	return (
		<LazyMotion features={domAnimation}>
			<AppProviders>
				<LicenseGate>
					<DragDropProvider>
						<AppShell />
					</DragDropProvider>
				</LicenseGate>
			</AppProviders>
		</LazyMotion>
	);
}

export default App;
