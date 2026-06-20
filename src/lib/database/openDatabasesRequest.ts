export interface DatabasesOpenRequest {
	databaseId: string | null;
	openCreateDialog: boolean;
	nonce: number;
}

export const INITIAL_DATABASES_OPEN_REQUEST: DatabasesOpenRequest = {
	databaseId: null,
	openCreateDialog: false,
	nonce: 0,
};

export function nextDatabasesOpenRequest(
	current: DatabasesOpenRequest,
	patch: { databaseId?: string | null; openCreateDialog?: boolean },
): DatabasesOpenRequest {
	const databaseId =
		patch.databaseId !== undefined ? patch.databaseId : current.databaseId;
	const openCreateDialog =
		patch.openCreateDialog !== undefined
			? patch.openCreateDialog
			: current.openCreateDialog;
	const databaseIdChanged =
		patch.databaseId !== undefined && patch.databaseId !== current.databaseId;
	const openCreateDialogChanged =
		patch.openCreateDialog !== undefined &&
		patch.openCreateDialog !== current.openCreateDialog;

	return {
		databaseId,
		openCreateDialog,
		nonce:
			databaseIdChanged || openCreateDialogChanged
				? current.nonce + 1
				: current.nonce,
	};
}

/** Clears a one-shot open-create-dialog intent after it has been consumed. */
export function consumeCreateCollectionDialog(
	request: DatabasesOpenRequest,
): DatabasesOpenRequest {
	if (!request.openCreateDialog) {
		return request;
	}
	return {
		...request,
		openCreateDialog: false,
	};
}
