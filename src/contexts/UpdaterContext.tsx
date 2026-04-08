import { type ReactNode, createContext, useContext } from "react";
import type { AutoUpdaterState } from "../hooks/useAutoUpdater";

const DEFAULT_UPDATER_STATE: AutoUpdaterState = {
	updateReady: false,
	updateVersion: null,
	isChecking: false,
	checkForUpdates: async () => null,
	installAndRelaunch: () => {},
};

const UpdaterContext = createContext<AutoUpdaterState>(DEFAULT_UPDATER_STATE);

export function UpdaterProvider({
	children,
	value,
}: {
	children: ReactNode;
	value: AutoUpdaterState;
}) {
	return (
		<UpdaterContext.Provider value={value}>{children}</UpdaterContext.Provider>
	);
}

export function useUpdaterContext(): AutoUpdaterState {
	return useContext(UpdaterContext);
}
