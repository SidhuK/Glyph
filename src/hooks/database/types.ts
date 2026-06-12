import type {
	DatabaseConfig,
	WorkspaceDatabaseDefinition,
	WorkspaceDatabaseDocument,
} from "../../lib/tauri";

export type DatabaseView = WorkspaceDatabaseDefinition["views"][number];

export interface PaneErrorHandlers {
	setError: (message: string) => void;
	clearError: () => void;
}

export interface ActiveCollection {
	document: WorkspaceDatabaseDocument;
	config: DatabaseConfig;
	view: DatabaseView;
}

export interface DatabaseBoardHandlers {
	onLaneOrderChange: (groupColumnId: string, laneOrder: string[]) => void;
	onCardOrderChange: (
		groupColumnId: string,
		cardOrder: Record<string, string[]>,
	) => void;
	onLaneColorChange: (laneId: string, color: string | null) => void;
}
