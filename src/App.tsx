import "./App.css";
import { LazyMotion, domAnimation } from "motion/react";
import { AppShell } from "./components/app/AppShell";
import { AppProviders } from "./contexts";

function App() {
	return (
		<LazyMotion features={domAnimation}>
			<AppProviders>
				<AppShell />
			</AppProviders>
		</LazyMotion>
	);
}

export default App;
