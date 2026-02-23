import "./App.css";
import { LazyMotion, domAnimation } from "motion/react";
import { AppShell } from "./components/app/AppShell";
import { AppProviders } from "./contexts";
import { useAutoUpdater } from "./hooks/useAutoUpdater";

function App() {
	useAutoUpdater();

	return (
		<LazyMotion features={domAnimation}>
			<AppProviders>
				<AppShell />
			</AppProviders>
		</LazyMotion>
	);
}

export default App;
