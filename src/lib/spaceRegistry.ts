import { emit } from "@tauri-apps/api/event";

export function spaceDisplayName(path: string): string {
	const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
	const parts = normalized.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? path;
}

export async function emitSpacePathsUpdated(): Promise<void> {
	try {
		await emit("space:registry_updated");
	} catch {
		// Cross-window synchronization is best effort during window teardown.
	}
}
