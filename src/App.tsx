import "./App.css";
import { AppShell } from "./components/app/AppShell";
import { AppProviders } from "./contexts";

function App() {
	return (
		<AppProviders>
			<AppShell />
		</AppProviders>
	);
}

export default App;
