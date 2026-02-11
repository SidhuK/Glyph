import { ThemeProvider } from "next-themes";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import SettingsApp from "./SettingsApp";
import { Toaster } from "./components/ui/shadcn/sonner";

function isSettingsRoute(hash: string): boolean {
	return hash.startsWith("#/settings");
}

function Root() {
	const [hash, setHash] = React.useState(() => window.location.hash);
	React.useEffect(() => {
		const onHashChange = () => setHash(window.location.hash);
		window.addEventListener("hashchange", onHashChange);
		return () => window.removeEventListener("hashchange", onHashChange);
	}, []);

	return isSettingsRoute(hash) ? <SettingsApp /> : <App />;
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element");

ReactDOM.createRoot(rootEl).render(
	<React.StrictMode>
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
			<Root />
			<Toaster />
		</ThemeProvider>
	</React.StrictMode>,
);
