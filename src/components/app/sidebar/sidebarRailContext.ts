import { createContext, useContext } from "react";

export interface SidebarRailState {
	/** True while the sidebar is collapsed to the icon rail. */
	rail: boolean;
}

export const SidebarRailContext = createContext<SidebarRailState>({ rail: false });

/** Lets sidebar children switch structure between the icon rail and the expanded sidebar. */
export function useSidebarRail(): SidebarRailState {
	return useContext(SidebarRailContext);
}
