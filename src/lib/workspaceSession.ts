import {
	paneIdsInLayout,
	type SplitEditorNode,
} from "../components/app/splitEditorModel";
import { isMarkdownPath, normalizeRelPath } from "../utils/path";
import { getSettingsStore, saveSettingsStore } from "./settingsStore";

const WORKSPACE_SESSION_BY_SPACE_KEY = "workspace.sessionBySpace";

export interface WorkspaceSessionTabSnapshot {
	kind: "file" | "special";
	target: string;
	paneId?: string;
}

interface WorkspaceSessionTabInput {
	kind: "file" | "special";
	target: string;
	paneId?: string;
}

export interface WorkspaceSessionSnapshot {
	version: 1;
	savedAt: number;
	tabs: WorkspaceSessionTabSnapshot[];
	activeTabTarget: string | null;
	activeTabTargetByPane?: Record<string, string | null>;
	focusedPaneId?: string | null;
	splitLayout?: SplitEditorNode | null;
}

type WorkspaceSessionSnapshotInput = Omit<
	WorkspaceSessionSnapshot,
	| "tabs"
	| "activeTabTargetByPane"
	| "focusedPaneId"
	| "splitLayout"
> & {
	tabs: WorkspaceSessionTabInput[];
	activeTabTargetByPane?: Record<string, string | null>;
	focusedPaneId?: string | null;
	splitLayout?: SplitEditorNode | null;
};

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

	const paneId =
		typeof value.paneId === "string" && value.paneId.trim()
			? value.paneId.trim()
			: "editor-pane-primary";
	const paneSnapshot =
		typeof value.paneId === "string" && value.paneId.trim()
			? { paneId }
			: {};

	if (value.kind === "file") {
		const target = normalizeRelPath(value.target);
		if (!isMarkdownPath(target)) return null;
		const key = `${paneId}\0${target}`;
		if (seenTargets.has(key)) return null;
		seenTargets.add(key);
		return { kind: "file", target, ...paneSnapshot };
	}

	const target = value.target.trim();
	if (!target || target.length > 120) return null;
	const key = `${paneId}\0${target}`;
	if (seenTargets.has(key)) return null;
	seenTargets.add(key);
	return { kind: "special", target, ...paneSnapshot };
}

function normalizeSplitEditorNode(
	value: unknown,
	paneIds: Set<string>,
	splitIds: Set<string>,
	depth = 0,
): SplitEditorNode | null {
	if (!isRecord(value) || depth > 12) return null;
	if (value.type === "pane") {
		if (typeof value.paneId !== "string" || !value.paneId.trim()) return null;
		const paneId = value.paneId.trim();
		if (paneIds.has(paneId)) return null;
		paneIds.add(paneId);
		return { type: "pane", paneId };
	}
	if (
		value.type !== "split" ||
		typeof value.id !== "string" ||
		(value.direction !== "horizontal" && value.direction !== "vertical") ||
		typeof value.ratio !== "number" ||
		!Number.isFinite(value.ratio)
	) {
		return null;
	}
	const id = value.id.trim();
	if (!id || splitIds.has(id)) return null;
	splitIds.add(id);
	const first = normalizeSplitEditorNode(
		value.first,
		paneIds,
		splitIds,
		depth + 1,
	);
	const second = normalizeSplitEditorNode(
		value.second,
		paneIds,
		splitIds,
		depth + 1,
	);
	if (!first || !second) return null;
	return {
		type: "split",
		id,
		direction: value.direction,
		ratio: Math.min(0.8, Math.max(0.2, value.ratio)),
		first,
		second,
	};
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
	const splitLayout = normalizeSplitEditorNode(
		value.splitLayout,
		new Set(),
		new Set(),
	);
	const layoutPaneIds = new Set(
		splitLayout ? paneIdsInLayout(splitLayout) : ["editor-pane-primary"],
	);
	const activeTabTargetByPane: Record<string, string | null> = {};
	if (isRecord(value.activeTabTargetByPane)) {
		for (const [paneId, target] of Object.entries(
			value.activeTabTargetByPane,
		)) {
			activeTabTargetByPane[paneId] =
				typeof target === "string" &&
				tabs.some(
					(tab) =>
						(tab.paneId ?? "editor-pane-primary") === paneId &&
						tab.target === target,
				)
					? target
					: null;
		}
	}
	const focusedPaneId =
		typeof value.focusedPaneId === "string" &&
		layoutPaneIds.has(value.focusedPaneId)
			? value.focusedPaneId
			: null;
	const savedAt =
		typeof value.savedAt === "number" && Number.isFinite(value.savedAt)
			? Math.floor(value.savedAt)
			: 0;
	const hasSplitEditorState =
		"splitLayout" in value ||
		"focusedPaneId" in value ||
		"activeTabTargetByPane" in value ||
		value.tabs.some((tab) => isRecord(tab) && "paneId" in tab);
	return {
		version: 1,
		savedAt,
		tabs,
		activeTabTarget,
		...(hasSplitEditorState
			? {
					activeTabTargetByPane,
					focusedPaneId,
					splitLayout,
				}
			: {}),
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
	snapshot: WorkspaceSessionSnapshotInput,
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
		activeTabTargetByPane: {},
		focusedPaneId: null,
		splitLayout: null,
	};
	await store.set(WORKSPACE_SESSION_BY_SPACE_KEY, sessionBySpace);
	await saveSettingsStore(store);
}
