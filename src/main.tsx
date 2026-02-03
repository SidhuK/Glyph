import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import SettingsApp from "./SettingsApp";

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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<Root />
	</React.StrictMode>,
);
