import { isMarkdownPath, normalizeRelPath } from "../utils/path";
import { getSettingsStore, saveSettingsStore } from "./settingsStore";

const WORKSPACE_SESSION_BY_SPACE_KEY = "workspace.sessionBySpace";

export interface WorkspaceSessionTabSnapshot {
	kind: "file" | "special";
	target: string;
}

export interface WorkspaceSessionSnapshot {
	version: 1;
	savedAt: number;
	tabs: WorkspaceSessionTabSnapshot[];
	activeTabTarget: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWorkspaceSessionTab(
	value: unknown,
	seenTargets: Set<string>,
): WorkspaceSessionTabSnapshot | null {
	if (!isRecord(value)) return null;
	if (value.kind !== "file" && value.kind !== "special") return null;
	if (typeof value.target !== "string") return null;

	if (value.kind === "file") {
		const target = normalizeRelPath(value.target);
		if (!isMarkdownPath(target)) return null;
		if (seenTargets.has(target)) return null;
		seenTargets.add(target);
		return { kind: "file", target };
	}

	const target = value.target.trim();
	if (!target || target.length > 120) return null;
	if (seenTargets.has(target)) return null;
	seenTargets.add(target);
	return { kind: "special", target };
}

function normalizeWorkspaceSessionSnapshot(
	value: unknown,
): WorkspaceSessionSnapshot | null {
	if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.tabs)) {
		return null;
	}
	const seenTargets = new Set<string>();
	const tabs = value.tabs
		.map((tab) => normalizeWorkspaceSessionTab(tab, seenTargets))
		.filter((tab): tab is WorkspaceSessionTabSnapshot => tab !== null);
	const activeTabTarget =
		typeof value.activeTabTarget === "string" &&
		tabs.some((tab) => tab.target === value.activeTabTarget)
			? value.activeTabTarget
			: null;
	const savedAt =
		typeof value.savedAt === "number" && Number.isFinite(value.savedAt)
			? Math.floor(value.savedAt)
			: 0;
	return {
		version: 1,
		savedAt,
		tabs,
		activeTabTarget,
	};
}

function normalizeWorkspaceSessionMap(
	value: unknown,
): Record<string, WorkspaceSessionSnapshot> {
	if (!isRecord(value)) return {};
	const out: Record<string, WorkspaceSessionSnapshot> = {};
	for (const [spacePath, snapshot] of Object.entries(value)) {
		const key = spacePath.trim();
		if (!key) continue;
		const normalized = normalizeWorkspaceSessionSnapshot(snapshot);
		if (normalized) out[key] = normalized;
	}
	return out;
}

export async function loadWorkspaceSessionSnapshot(
	spacePath: string,
): Promise<WorkspaceSessionSnapshot | null> {
	const store = await getSettingsStore();
	const sessionBySpace = normalizeWorkspaceSessionMap(
		await store.get<unknown>(WORKSPACE_SESSION_BY_SPACE_KEY),
	);
	return sessionBySpace[spacePath] ?? null;
}

export async function saveWorkspaceSessionSnapshot(
	spacePath: string,
	snapshot: WorkspaceSessionSnapshot,
): Promise<void> {
	const store = await getSettingsStore();
	const sessionBySpace = normalizeWorkspaceSessionMap(
		await store.get<unknown>(WORKSPACE_SESSION_BY_SPACE_KEY),
	);
	sessionBySpace[spacePath] = normalizeWorkspaceSessionSnapshot(snapshot) ?? {
		version: 1,
		savedAt: Date.now(),
		tabs: [],
		activeTabTarget: null,
	};
	await store.set(WORKSPACE_SESSION_BY_SPACE_KEY, sessionBySpace);
	await saveSettingsStore(store);
}
