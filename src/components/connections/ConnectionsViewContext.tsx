import { type ReactNode, type RefObject, createContext, useContext } from "react";
import type { ConnectionsGraphOptions } from "../../lib/connectionsGraphOptions";
import type { ConnectionsGraph } from "./connectionsGraph";
import type { ConnectionsOverlayApi } from "./useSigmaConnections";

export type ConnectionsPathEnd = "from" | "to";

export interface ConnectionsViewContextValue {
	/** Null while the space graph is still loading or laying out. */
	readonly graph: ConnectionsGraph | null;
	readonly selectedId: string | null;
	readonly selectNode: (id: string | null) => void;
	readonly pathMode: boolean;
	readonly setPathMode: (pathMode: boolean) => void;
	readonly pathFromId: string | null;
	readonly pathToId: string | null;
	/** Shortest route from `pathFromId` to a different `pathToId`; null when an end is missing or none exists. */
	readonly path: readonly string[] | null;
	/** Ignores a "to" end equal to the start, so clicking the start again never makes a one-note path. */
	readonly setPathEnd: (id: string, end: ConnectionsPathEnd) => void;
	/** Enters path mode with `id` as the start and no end. */
	readonly startPath: (id: string) => void;
	readonly clearPath: () => void;
	readonly hiddenCommunities: ReadonlySet<number>;
	readonly toggleCommunity: (index: number) => void;
	readonly showUnlinked: boolean;
	readonly setShowUnlinked: (show: boolean) => void;
	readonly unlinkedCount: number;
	readonly zoomPercent: number;
	readonly overlay: RefObject<ConnectionsOverlayApi>;
	/** Opens a note, or runs a tag search for a tag. */
	readonly openNode: (id: string) => void;
	readonly searchQuery: string;
	readonly setSearchQuery: (query: string) => void;
	readonly searchInputRef: RefObject<HTMLInputElement | null>;
	readonly options: ConnectionsGraphOptions;
	readonly setOptions: (options: ConnectionsGraphOptions) => void;
}

const ConnectionsViewContext = createContext<ConnectionsViewContextValue | null>(null);

export function ConnectionsViewProvider({
	value,
	children,
}: {
	value: ConnectionsViewContextValue;
	children: ReactNode;
}) {
	return (
		<ConnectionsViewContext.Provider value={value}>{children}</ConnectionsViewContext.Provider>
	);
}

export function useConnectionsView() {
	const value = useContext(ConnectionsViewContext);
	if (!value) throw new Error("useConnectionsView must be used inside ConnectionsViewProvider");
	return value;
}
