import type { WorkspaceDatabaseDefinition } from "../tauri";

export function shouldReloadSummaries(
	prev: WorkspaceDatabaseDefinition,
	next: WorkspaceDatabaseDefinition,
): boolean {
	return (
		prev.name !== next.name ||
		prev.icon !== next.icon ||
		prev.color !== next.color ||
		prev.views.length !== next.views.length
	);
}
