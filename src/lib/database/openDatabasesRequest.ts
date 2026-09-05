export interface DatabasesOpenRequest {
	databaseId: string | null;
	openCreateDialog: boolean;
	paneId: string | null;
	nonce: number;
}

export const INITIAL_DATABASES_OPEN_REQUEST: DatabasesOpenRequest = {
	databaseId: null,
	openCreateDialog: false,
	paneId: null,
	nonce: 0,
};

export function nextDatabasesOpenRequest(
	current: DatabasesOpenRequest,
	patch: {
		databaseId?: string | null;
		openCreateDialog?: boolean;
		paneId?: string | null;
	},
): DatabasesOpenRequest {
	const databaseId =
		patch.databaseId !== undefined ? patch.databaseId : current.databaseId;
	const openCreateDialog =
		patch.openCreateDialog !== undefined
			? patch.openCreateDialog
			: current.openCreateDialog;
	const paneId = patch.paneId !== undefined ? patch.paneId : current.paneId;
	const databaseIdChanged =
		patch.databaseId !== undefined && patch.databaseId !== current.databaseId;
	const openCreateDialogChanged =
		patch.openCreateDialog !== undefined &&
		patch.openCreateDialog !== current.openCreateDialog;
	const paneIdChanged =
		patch.paneId !== undefined && patch.paneId !== current.paneId;
	const openCreateRequested = patch.openCreateDialog === true;

	return {
		databaseId,
		openCreateDialog,
		paneId,
		nonce:
			databaseIdChanged ||
			openCreateDialogChanged ||
			paneIdChanged ||
			openCreateRequested
				? current.nonce + 1
				: current.nonce,
	};
}
