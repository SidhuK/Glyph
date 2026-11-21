export interface DatabasesOpenRequest {
	databaseId: string | null;
	openCreator: boolean;
	paneId: string | null;
	nonce: number;
}

export const INITIAL_DATABASES_OPEN_REQUEST: DatabasesOpenRequest = {
	databaseId: null,
	openCreator: false,
	paneId: null,
	nonce: 0,
};

export function nextDatabasesOpenRequest(
	current: DatabasesOpenRequest,
	patch: {
		databaseId?: string | null;
		openCreator?: boolean;
		paneId?: string | null;
	},
): DatabasesOpenRequest {
	const databaseId = patch.databaseId !== undefined ? patch.databaseId : current.databaseId;
	const openCreator = patch.openCreator !== undefined ? patch.openCreator : current.openCreator;
	const paneId = patch.paneId !== undefined ? patch.paneId : current.paneId;
	const databaseIdChanged =
		patch.databaseId !== undefined && patch.databaseId !== current.databaseId;
	const openCreatorChanged =
		patch.openCreator !== undefined && patch.openCreator !== current.openCreator;
	const paneIdChanged = patch.paneId !== undefined && patch.paneId !== current.paneId;
	const openCreateRequested = patch.openCreator === true;

	return {
		databaseId,
		openCreator,
		paneId,
		nonce:
			databaseIdChanged || openCreatorChanged || paneIdChanged || openCreateRequested
				? current.nonce + 1
				: current.nonce,
	};
}
