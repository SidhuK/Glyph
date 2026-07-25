import {
	type SetStateAction,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useFileTreeContext, useUILayoutContext } from "../../contexts";
import { useRecentFiles } from "../../hooks/useRecentFiles";
import {
	PRIMARY_EDITOR_PANE_ID,
	type SplitEditorNode,
	createInitialSplitEditorLayout,
	paneIdsInLayout,
	removeEditorPane,
} from "../../lib/splitEditor";
import { isMarkdownPath } from "../../utils/path";
import { useSplitEditorTabs } from "./useSplitEditorTabs";

export interface WorkspaceTab {
	id: string;
	paneId: string;
	kind: "blank" | "file" | "special";
	target: string | null;
}

export interface WorkspaceEditorPane {
	id: string;
	tabs: WorkspaceTab[];
	activeTabId: string | null;
	activeTabPath: string | null;
	canGoBack: boolean;
	canGoForward: boolean;
}

type NoteHistoryEntry = {
	path: string;
};

type TabNoteHistory = {
	entries: NoteHistoryEntry[];
	index: number;
};

export type TabHistoryById = Record<string, TabNoteHistory>;

interface RestoredWorkspaceTab {
	kind: "file" | "special";
	target: string;
	paneId: string;
}

function matchesRemovedPath(
	tab: WorkspaceTab,
	path: string,
	recursive: boolean,
): boolean {
	if (tab.kind !== "file" || !tab.target) return false;
	if (tab.target === path) return true;
	return recursive && tab.target.startsWith(`${path}/`);
}

function nearestTabIdInPane(
	currentTabs: WorkspaceTab[],
	nextTabs: WorkspaceTab[],
	removedIndex: number,
	paneId: string,
): string | null {
	const next = nextTabs.find(
		(tab) => tab.paneId === paneId && currentTabs.indexOf(tab) > removedIndex,
	);
	if (next) return next.id;
	for (let index = nextTabs.length - 1; index >= 0; index -= 1) {
		const tab = nextTabs[index];
		if (tab?.paneId === paneId && currentTabs.indexOf(tab) < removedIndex) {
			return tab.id;
		}
	}
	return null;
}

function paneIdForTab(tabs: WorkspaceTab[], tabId: string | null): string {
	return tabs.find((tab) => tab.id === tabId)?.paneId ?? PRIMARY_EDITOR_PANE_ID;
}

export function useTabManager(spacePath: string | null) {
	const { setActiveFilePath } = useFileTreeContext();
	const { addRecentFile } = useRecentFiles(spacePath, 7);
	const { setOpenMarkdownTabs, setActiveMarkdownTabPath } =
		useUILayoutContext();

	const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
	const [activeTabId, setActiveTabIdState] = useState<string | null>(null);
	const [splitLayout, setSplitLayoutState] = useState<SplitEditorNode>(
		createInitialSplitEditorLayout,
	);
	const [activeTabByPane, setActiveTabByPane] = useState<
		Record<string, string | null>
	>({ [PRIMARY_EDITOR_PANE_ID]: null });
	const [dirtyByPath, setDirtyByPath] = useState<Record<string, boolean>>({});
	const [historyByTabId, setHistoryByTabId] = useState<TabHistoryById>({});
	const [tabsRevision, setTabsRevision] = useState(0);
	const tabIdCounterRef = useRef(0);
	const tabsRef = useRef<WorkspaceTab[]>([]);
	const activeTabIdRef = useRef<string | null>(null);
	const splitLayoutRef = useRef(splitLayout);
	const activeTabByPaneRef = useRef<Record<string, string | null>>({
		[PRIMARY_EDITOR_PANE_ID]: null,
	});
	const historyByTabIdRef = useRef<TabHistoryById>({});

	tabsRef.current = tabs;
	activeTabIdRef.current = activeTabId;
	historyByTabIdRef.current = historyByTabId;

	const setSplitLayout = useCallback(
		(action: SetStateAction<SplitEditorNode>) => {
			const nextLayout =
				typeof action === "function" ? action(splitLayoutRef.current) : action;
			splitLayoutRef.current = nextLayout;
			setSplitLayoutState(nextLayout);
		},
		[],
	);

	const createTab = useCallback(
		(
			kind: WorkspaceTab["kind"],
			target: string | null,
			paneId = paneIdForTab(tabsRef.current, activeTabIdRef.current),
		): WorkspaceTab => ({
			id: `workspace-tab-${++tabIdCounterRef.current}`,
			paneId,
			kind,
			target,
		}),
		[],
	);

	const activeTab = useMemo(
		() => tabs.find((tab) => tab.id === activeTabId) ?? null,
		[tabs, activeTabId],
	);
	const activeTabPath =
		activeTab && activeTab.kind !== "blank" ? activeTab.target : null;
	const focusedPaneId = activeTab?.paneId ?? PRIMARY_EDITOR_PANE_ID;

	const syncWorkspaceState = useCallback(
		(
			nextTabs: WorkspaceTab[],
			nextActiveTabId: string | null,
			previousActiveTarget: string | null,
		) => {
			const nextActiveTab =
				nextTabs.find((tab) => tab.id === nextActiveTabId) ?? null;
			const nextFilePath =
				nextActiveTab?.kind === "file" && nextActiveTab.target
					? nextActiveTab.target
					: null;
			const nextMarkdownTabs = [
				...new Set(
					nextTabs.flatMap((tab) =>
						tab.kind === "file" &&
						tab.target !== null &&
						isMarkdownPath(tab.target)
							? [tab.target]
							: [],
					),
				),
			];
			const nextActiveMarkdownPath =
				nextActiveTab?.kind === "file" &&
				nextActiveTab.target !== null &&
				isMarkdownPath(nextActiveTab.target)
					? nextActiveTab.target
					: null;

			setActiveFilePath(nextFilePath);
			setOpenMarkdownTabs(nextMarkdownTabs);
			setActiveMarkdownTabPath(nextActiveMarkdownPath);

			const targetChanged = previousActiveTarget !== nextActiveTab?.target;

			if (
				nextActiveTab?.kind === "file" &&
				nextActiveTab.target &&
				spacePath &&
				targetChanged
			) {
				void addRecentFile(nextActiveTab.target, spacePath);
			}
		},
		[
			addRecentFile,
			setActiveFilePath,
			setActiveMarkdownTabPath,
			setOpenMarkdownTabs,
			spacePath,
		],
	);

	const commitTabsChange = useCallback(
		(nextTabs: WorkspaceTab[], nextActiveTabId: string | null) => {
			const previousActiveTabId = activeTabIdRef.current;
			const previousActiveTab = tabsRef.current.find(
				(t) => t.id === previousActiveTabId,
			);
			const previousActiveTarget = previousActiveTab?.target ?? null;
			tabsRef.current = nextTabs;
			activeTabIdRef.current = nextActiveTabId;
			const nextActivePaneId =
				nextTabs.find((tab) => tab.id === nextActiveTabId)?.paneId ??
				PRIMARY_EDITOR_PANE_ID;
			const nextActiveByPane: Record<string, string | null> = {};
			for (const tab of nextTabs) {
				if (tab.paneId in nextActiveByPane) continue;
				const currentActiveId = activeTabByPaneRef.current[tab.paneId];
				nextActiveByPane[tab.paneId] =
					currentActiveId &&
					nextTabs.some(
						(candidate) =>
							candidate.id === currentActiveId &&
							candidate.paneId === tab.paneId,
					)
						? currentActiveId
						: tab.id;
			}
			nextActiveByPane[nextActivePaneId] = nextActiveTabId;
			activeTabByPaneRef.current = nextActiveByPane;
			setTabs(nextTabs);
			setActiveTabIdState(nextActiveTabId);
			setActiveTabByPane(nextActiveByPane);
			setTabsRevision((revision) => revision + 1);
			syncWorkspaceState(nextTabs, nextActiveTabId, previousActiveTarget);
		},
		[syncWorkspaceState],
	);

	const setActiveTabId = useCallback(
		(nextActiveTabId: string | null) => {
			commitTabsChange(tabsRef.current, nextActiveTabId);
		},
		[commitTabsChange],
	);

	const focusPane = useCallback(
		(paneId: string) => {
			if (paneIdForTab(tabsRef.current, activeTabIdRef.current) === paneId)
				return;
			const paneTabs = tabsRef.current.filter((tab) => tab.paneId === paneId);
			const nextActiveTabId =
				activeTabByPaneRef.current[paneId] ?? paneTabs[0]?.id ?? null;
			commitTabsChange(tabsRef.current, nextActiveTabId);
		},
		[commitTabsChange],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset tab state when the active space changes.
	useEffect(() => {
		tabsRef.current = [];
		activeTabIdRef.current = null;
		historyByTabIdRef.current = {};
		activeTabByPaneRef.current = { [PRIMARY_EDITOR_PANE_ID]: null };
		setTabs([]);
		setActiveTabIdState(null);
		setSplitLayout(createInitialSplitEditorLayout());
		setActiveTabByPane({ [PRIMARY_EDITOR_PANE_ID]: null });
		setDirtyByPath({});
		setHistoryByTabId({});
		setTabsRevision(0);
	}, [spacePath]);

	const focusExistingTab = useCallback(
		(target: string) => {
			const existing = tabsRef.current.find(
				(tab) =>
					tab.paneId ===
						paneIdForTab(tabsRef.current, activeTabIdRef.current) &&
					tab.target === target,
			);
			if (!existing) return false;
			setActiveTabId(existing.id);
			return true;
		},
		[setActiveTabId],
	);

	const clearDirtyForTarget = useCallback((target: string | null) => {
		if (!target) return;
		setDirtyByPath((prev) => {
			if (!(target in prev)) return prev;
			const next = { ...prev };
			delete next[target];
			return next;
		});
	}, []);

	const updateHistoryState = useCallback(
		(updater: (prev: TabHistoryById) => TabHistoryById) => {
			const prev = historyByTabIdRef.current;
			const next = updater(prev);
			if (next === prev) return prev;
			historyByTabIdRef.current = next;
			setHistoryByTabId(next);
			return next;
		},
		[],
	);

	const updateActiveTabInPlace = useCallback(
		(kind: WorkspaceTab["kind"], target: string | null): string => {
			const currentTabs = tabsRef.current;
			const previousActiveTabId = activeTabIdRef.current;

			if (!previousActiveTabId) {
				const nextTab = createTab(kind, target);
				commitTabsChange([...currentTabs, nextTab], nextTab.id);
				return nextTab.id;
			}

			const activeIndex = currentTabs.findIndex(
				(tab) => tab.id === previousActiveTabId,
			);

			if (activeIndex === -1) {
				const nextTab = createTab(kind, target);
				commitTabsChange([...currentTabs, nextTab], nextTab.id);
				return nextTab.id;
			}

			const currentTab = currentTabs[activeIndex];
			if (currentTab?.kind === "file") {
				clearDirtyForTarget(currentTab.target);
			}

			const nextTabs = [...currentTabs];
			nextTabs[activeIndex] = { ...currentTab, kind, target };
			commitTabsChange(nextTabs, previousActiveTabId);
			return previousActiveTabId;
		},
		[clearDirtyForTarget, commitTabsChange, createTab],
	);

	const pushNoteHistory = useCallback(
		(tabId: string, path: string) => {
			if (!isMarkdownPath(path)) return;
			updateHistoryState((prev) => {
				const current = prev[tabId] ?? { entries: [], index: -1 };
				const entries = current.entries;
				const currentIndex = current.index;

				if (currentIndex >= 0 && entries[currentIndex]?.path === path) {
					return prev;
				}

				const newEntries = entries.slice(0, currentIndex + 1);
				newEntries.push({ path });

				return {
					...prev,
					[tabId]: {
						entries: newEntries,
						index: newEntries.length - 1,
					},
				};
			});
		},
		[updateHistoryState],
	);

	const clearHistoryForTab = useCallback(
		(tabId: string) => {
			updateHistoryState((prev) => {
				if (!(tabId in prev)) return prev;
				const next = { ...prev };
				delete next[tabId];
				return next;
			});
		},
		[updateHistoryState],
	);

	const stepHistory = useCallback(
		(tabId: string, delta: -1 | 1): string | null => {
			const history = historyByTabIdRef.current[tabId];
			if (!history) return null;

			const nextIndex = history.index + delta;
			if (nextIndex < 0 || nextIndex >= history.entries.length) return null;

			const entry = history.entries[nextIndex];
			if (!entry) return null;

			updateHistoryState((prev) => {
				const current = prev[tabId];
				if (!current) return prev;
				return {
					...prev,
					[tabId]: { ...current, index: nextIndex },
				};
			});

			return entry.path;
		},
		[updateHistoryState],
	);

	const navigateTabHistory = useCallback(
		(tabId: string, delta: -1 | 1) => {
			const path = stepHistory(tabId, delta);
			if (!path) return;
			activeTabIdRef.current = tabId;
			updateActiveTabInPlace("file", path);
		},
		[stepHistory, updateActiveTabInPlace],
	);

	const goBack = useCallback(() => {
		const activeId = activeTabIdRef.current;
		if (activeId) navigateTabHistory(activeId, -1);
	}, [navigateTabHistory]);

	const goForward = useCallback(() => {
		const activeId = activeTabIdRef.current;
		if (activeId) navigateTabHistory(activeId, 1);
	}, [navigateTabHistory]);

	const activeHistory =
		activeTabId !== null ? (historyByTabId[activeTabId] ?? null) : null;

	const canGoBack = (activeHistory?.index ?? -1) > 0;

	const canGoForward =
		(activeHistory?.index ?? -1) < (activeHistory?.entries.length ?? 0) - 1;

	const canOpenInMainPane = useCallback(
		(path: string) => isMarkdownPath(path),
		[],
	);

	const openFileTab = useCallback(
		(path: string) => {
			if (!canOpenInMainPane(path)) return false;
			const existing = tabsRef.current.find(
				(tab) => tab.kind === "file" && tab.target === path,
			);
			if (existing) {
				setActiveTabId(existing.id);
				return true;
			}

			const currentActiveId = activeTabIdRef.current;
			const currentTabs = tabsRef.current;
			const activeIndex = currentTabs.findIndex(
				(t) => t.id === currentActiveId,
			);
			const isReplacingBlank =
				activeIndex >= 0 && currentTabs[activeIndex]?.kind === "blank";

			if (isReplacingBlank && currentActiveId) {
				clearHistoryForTab(currentActiveId);
			}

			const tabId = updateActiveTabInPlace("file", path);

			if (isMarkdownPath(path)) {
				pushNoteHistory(tabId, path);
			}

			return true;
		},
		[
			canOpenInMainPane,
			clearHistoryForTab,
			pushNoteHistory,
			setActiveTabId,
			updateActiveTabInPlace,
		],
	);

	const openSpecialTab = useCallback(
		(target: string) => {
			if (focusExistingTab(target)) return;

			const currentActiveId = activeTabIdRef.current;
			const currentTabs = tabsRef.current;
			const activeIndex = currentTabs.findIndex(
				(t) => t.id === currentActiveId,
			);
			const isReplacingBlank =
				activeIndex >= 0 && currentTabs[activeIndex]?.kind === "blank";

			if (isReplacingBlank && currentActiveId) {
				clearHistoryForTab(currentActiveId);
			}

			updateActiveTabInPlace("special", target);
		},
		[clearHistoryForTab, focusExistingTab, updateActiveTabInPlace],
	);

	const restoreWorkspaceTabs = useCallback(
		(
			tabSnapshots: RestoredWorkspaceTab[],
			activeTabTarget: string | null,
			restoredLayout: SplitEditorNode | null,
			restoredFocusedPaneId: string | null,
			activeTabTargetByPane: Record<string, string | null>,
		) => {
			const nextLayout = restoredLayout ?? createInitialSplitEditorLayout();
			const layoutPaneIds = new Set(paneIdsInLayout(nextLayout));
			const fallbackPaneId =
				paneIdsInLayout(nextLayout)[0] ?? PRIMARY_EDITOR_PANE_ID;
			const seenTargets = new Set<string>();
			const nextTabs: WorkspaceTab[] = [];
			const nextHistory: TabHistoryById = {};

			for (const snapshot of tabSnapshots) {
				const paneId = layoutPaneIds.has(snapshot.paneId)
					? snapshot.paneId
					: fallbackPaneId;
				const targetKey =
					snapshot.kind === "file"
						? `file\0${snapshot.target}`
						: `special\0${paneId}\0${snapshot.target}`;
				if (seenTargets.has(targetKey)) continue;
				seenTargets.add(targetKey);
				const tab = createTab(snapshot.kind, snapshot.target, paneId);
				nextTabs.push(tab);
				if (snapshot.kind === "file" && isMarkdownPath(snapshot.target)) {
					nextHistory[tab.id] = {
						entries: [{ path: snapshot.target }],
						index: 0,
					};
				}
			}
			for (const paneId of layoutPaneIds) {
				if (!nextTabs.some((tab) => tab.paneId === paneId)) {
					nextTabs.push(createTab("blank", null, paneId));
				}
			}

			const nextActiveByPane: Record<string, string | null> = {};
			for (const paneId of layoutPaneIds) {
				const target = activeTabTargetByPane[paneId];
				nextActiveByPane[paneId] =
					nextTabs.find((tab) => tab.paneId === paneId && tab.target === target)
						?.id ??
					nextTabs.find((tab) => tab.paneId === paneId)?.id ??
					null;
			}
			const nextFocusedPaneId =
				restoredFocusedPaneId && layoutPaneIds.has(restoredFocusedPaneId)
					? restoredFocusedPaneId
					: fallbackPaneId;
			const nextActiveTabId =
				nextActiveByPane[nextFocusedPaneId] ??
				nextTabs.find((tab) => tab.target === activeTabTarget)?.id ??
				nextTabs[0]?.id ??
				null;

			historyByTabIdRef.current = nextHistory;
			activeTabByPaneRef.current = nextActiveByPane;
			setSplitLayout(nextLayout);
			setActiveTabByPane(nextActiveByPane);
			setHistoryByTabId(nextHistory);
			setDirtyByPath({});
			commitTabsChange(nextTabs, nextActiveTabId);
		},
		[commitTabsChange, createTab, setSplitLayout],
	);

	const openBlankTab = useCallback(() => {
		const blankTab = createTab("blank", null);
		commitTabsChange([...tabsRef.current, blankTab], blankTab.id);
	}, [commitTabsChange, createTab]);

	const replaceActiveTabWithBlank = useCallback(() => {
		if (activeTab?.kind === "blank") return;
		const currentActiveId = activeTabIdRef.current;
		if (currentActiveId) {
			clearHistoryForTab(currentActiveId);
		}
		updateActiveTabInPlace("blank", null);
	}, [activeTab?.kind, clearHistoryForTab, updateActiveTabInPlace]);

	const closeTab = useCallback(
		(tabId: string) => {
			const currentTabs = tabsRef.current;
			const index = currentTabs.findIndex((tab) => tab.id === tabId);
			if (index === -1) return;
			const removed = currentTabs[index];
			const removedTarget = removed?.kind === "file" ? removed.target : null;
			const removedWasFocused =
				removed?.paneId === paneIdForTab(currentTabs, activeTabIdRef.current);
			const nextTabs = currentTabs.filter((tab) => tab.id !== tabId);
			const removedPaneId = removed?.paneId;
			const replacementTabId = removedPaneId
				? nearestTabIdInPane(currentTabs, nextTabs, index, removedPaneId)
				: null;
			const nextActiveTabId =
				activeTabIdRef.current !== tabId
					? activeTabIdRef.current
					: replacementTabId;
			const currentLayout = splitLayoutRef.current;
			const paneIsEmpty =
				removedPaneId &&
				!nextTabs.some((tab) => tab.paneId === removedPaneId) &&
				paneIdsInLayout(currentLayout).length > 1;
			let committedActiveTabId = nextActiveTabId;
			if (paneIsEmpty && removedPaneId) {
				const nextLayout = removeEditorPane(currentLayout, removedPaneId);
				if (nextLayout) {
					setSplitLayout(nextLayout);
					if (removedWasFocused) {
						const fallbackPaneId =
							paneIdsInLayout(nextLayout)[0] ?? PRIMARY_EDITOR_PANE_ID;
						committedActiveTabId =
							activeTabByPaneRef.current[fallbackPaneId] ??
							nextTabs.find((tab) => tab.paneId === fallbackPaneId)?.id ??
							null;
					}
				}
			}
			if (
				removedTarget &&
				!nextTabs.some((tab) => tab.target === removedTarget)
			) {
				clearDirtyForTarget(removedTarget);
			}
			updateHistoryState((prev) => {
				if (!(tabId in prev)) return prev;
				const next = { ...prev };
				delete next[tabId];
				return next;
			});
			commitTabsChange(nextTabs, committedActiveTabId);
		},
		[clearDirtyForTarget, commitTabsChange, setSplitLayout, updateHistoryState],
	);

	const closeAllTabs = useCallback(() => {
		setSplitLayout(createInitialSplitEditorLayout());
		commitTabsChange([], null);
		setDirtyByPath({});
		historyByTabIdRef.current = {};
		setHistoryByTabId({});
	}, [commitTabsChange, setSplitLayout]);

	const closeActiveTab = useCallback(() => {
		if (!activeTabId) return;
		closeTab(activeTabId);
	}, [activeTabId, closeTab]);

	const closeTabsForPathRemoval = useCallback(
		(path: string, recursive = false) => {
			const currentTabs = tabsRef.current;
			let nextTabs = currentTabs.filter(
				(tab) => !matchesRemovedPath(tab, path, recursive),
			);
			const tabsRemoved = nextTabs.length < currentTabs.length;
			const removedTabIds = new Set(
				currentTabs
					.filter((tab) => matchesRemovedPath(tab, path, recursive))
					.map((tab) => tab.id),
			);

			const currentActiveTabId = activeTabIdRef.current;
			let nextActiveTabId = currentActiveTabId;
			if (tabsRemoved) {
				for (const paneId of paneIdsInLayout(splitLayoutRef.current)) {
					if (!nextTabs.some((tab) => tab.paneId === paneId)) {
						nextTabs = [...nextTabs, createTab("blank", null, paneId)];
					}
				}
			}
			if (tabsRemoved && currentActiveTabId) {
				const removedIndex = currentTabs.findIndex(
					(tab) => tab.id === currentActiveTabId,
				);
				const removedTab = removedIndex >= 0 ? currentTabs[removedIndex] : null;
				if (removedTab && matchesRemovedPath(removedTab, path, recursive)) {
					nextActiveTabId =
						nearestTabIdInPane(
							currentTabs,
							nextTabs,
							removedIndex,
							removedTab.paneId,
						) ??
						nextTabs.find((tab) => tab.paneId === removedTab.paneId)?.id ??
						null;
				}
			}
			updateHistoryState((prev) => {
				let changed = false;
				const next: TabHistoryById = {};
				for (const [tabId, history] of Object.entries(prev)) {
					if (removedTabIds.has(tabId)) {
						changed = true;
						continue;
					}
					const survivingEntries: NoteHistoryEntry[] = [];
					let newIndex = history.index;
					for (let i = 0; i < history.entries.length; i++) {
						const entry = history.entries[i];
						const matches =
							entry.path === path ||
							(recursive && entry.path.startsWith(`${path}/`));
						if (!matches) {
							survivingEntries.push(entry);
						} else {
							changed = true;
							if (i <= history.index && newIndex > 0) {
								newIndex--;
							}
						}
					}
					if (survivingEntries.length > 0) {
						next[tabId] = {
							entries: survivingEntries,
							index: Math.max(
								-1,
								Math.min(newIndex, survivingEntries.length - 1),
							),
						};
					}
				}
				return changed ? next : prev;
			});
			if (tabsRemoved) {
				commitTabsChange(nextTabs, nextActiveTabId);
			}
			setDirtyByPath((prev) => {
				let changed = false;
				const next: Record<string, boolean> = {};
				for (const [tabPath, dirty] of Object.entries(prev)) {
					if (
						tabPath === path ||
						(recursive && tabPath.startsWith(`${path}/`))
					) {
						changed = true;
						continue;
					}
					next[tabPath] = dirty;
				}
				return changed ? next : prev;
			});
		},
		[commitTabsChange, createTab, updateHistoryState],
	);

	const renameTabsForPath = useCallback(
		(fromPath: string, toPath: string, recursive = false) => {
			const currentTabs = tabsRef.current;
			let changed = false;
			const next = currentTabs.map((tab) => {
				if (tab.kind !== "file" || !tab.target) return tab;
				if (tab.target === fromPath) {
					changed = true;
					return { ...tab, target: toPath };
				}
				if (recursive && tab.target.startsWith(`${fromPath}/`)) {
					changed = true;
					return {
						...tab,
						target: `${toPath}${tab.target.slice(fromPath.length)}`,
					};
				}
				return tab;
			});
			updateHistoryState((prev) => {
				let historyChanged = false;
				const nextHistory: TabHistoryById = {};
				for (const [tabId, history] of Object.entries(prev)) {
					const newEntries = history.entries.map((entry) => {
						if (entry.path === fromPath) {
							historyChanged = true;
							return { path: toPath };
						}
						if (recursive && entry.path.startsWith(`${fromPath}/`)) {
							historyChanged = true;
							return {
								path: `${toPath}${entry.path.slice(fromPath.length)}`,
							};
						}
						return entry;
					});
					nextHistory[tabId] = { ...history, entries: newEntries };
				}
				return historyChanged ? nextHistory : prev;
			});
			if (changed) {
				commitTabsChange(next, activeTabIdRef.current);
			}
			setDirtyByPath((prev) => {
				let dirtyChanged = false;
				const nextDirty: Record<string, boolean> = {};
				for (const [tabPath, dirty] of Object.entries(prev)) {
					if (tabPath === fromPath) {
						nextDirty[toPath] = dirty;
						dirtyChanged = true;
						continue;
					}
					if (recursive && tabPath.startsWith(`${fromPath}/`)) {
						nextDirty[`${toPath}${tabPath.slice(fromPath.length)}`] = dirty;
						dirtyChanged = true;
						continue;
					}
					nextDirty[tabPath] = dirty;
				}
				return dirtyChanged ? nextDirty : prev;
			});
		},
		[commitTabsChange, updateHistoryState],
	);

	const reorderTabs = useCallback(
		(fromTabId: string, toTabId: string) => {
			if (!fromTabId || !toTabId || fromTabId === toTabId) return;
			const currentTabs = tabsRef.current;
			const fromIndex = currentTabs.findIndex((tab) => tab.id === fromTabId);
			const toIndex = currentTabs.findIndex((tab) => tab.id === toTabId);
			if (fromIndex === -1 || toIndex === -1) return;
			if (currentTabs[fromIndex]?.paneId !== currentTabs[toIndex]?.paneId)
				return;
			const next = [...currentTabs];
			const [moved] = next.splice(fromIndex, 1);
			next.splice(toIndex, 0, moved);
			commitTabsChange(next, activeTabIdRef.current);
		},
		[commitTabsChange],
	);

	const activateNextTab = useCallback(() => {
		const paneId = paneIdForTab(tabsRef.current, activeTabIdRef.current);
		const paneTabs = tabsRef.current.filter((tab) => tab.paneId === paneId);
		if (!paneTabs.length) return;
		const currentIndex = activeTabIdRef.current
			? paneTabs.findIndex((tab) => tab.id === activeTabIdRef.current)
			: -1;
		const nextIndex = (Math.max(currentIndex, -1) + 1) % paneTabs.length;
		setActiveTabId(paneTabs[nextIndex]?.id ?? null);
	}, [setActiveTabId]);

	const activatePreviousTab = useCallback(() => {
		const paneId = paneIdForTab(tabsRef.current, activeTabIdRef.current);
		const paneTabs = tabsRef.current.filter((tab) => tab.paneId === paneId);
		if (!paneTabs.length) return;
		const currentIndex = activeTabIdRef.current
			? paneTabs.findIndex((tab) => tab.id === activeTabIdRef.current)
			: 0;
		const nextIndex = (currentIndex - 1 + paneTabs.length) % paneTabs.length;
		setActiveTabId(paneTabs[nextIndex]?.id ?? null);
	}, [setActiveTabId]);

	const activateTabByIndex = useCallback(
		(index: number) => {
			const paneId = paneIdForTab(tabsRef.current, activeTabIdRef.current);
			const tab = tabsRef.current.filter(
				(candidate) => candidate.paneId === paneId,
			)[index];
			if (!tab) return false;
			setActiveTabId(tab.id);
			return true;
		},
		[setActiveTabId],
	);

	const {
		panes,
		openBlankTabInPane,
		openFileInPane,
		splitPaneWithFile,
		splitPaneWithBlank,
		moveTabToPane,
		resizeSplit,
		goBackInPane,
		goForwardInPane,
	} = useSplitEditorTabs({
		tabs,
		historyByTabId,
		splitLayout,
		splitLayoutRef,
		focusedPaneId,
		setSplitLayout,
		activeTabByPane,
		tabsRef,
		activeTabByPaneRef,
		createTab,
		commitTabsChange,
		setActiveTabId,
		clearHistoryForTab,
		pushNoteHistory,
		navigateTabHistory,
	});

	return {
		tabs,
		panes,
		splitLayout,
		focusedPaneId,
		activeTab,
		activeTabId,
		activeTabPath,
		setActiveTabId,
		focusPane,
		dirtyByPath,
		setDirtyByPath,
		closeTab,
		closeAllTabs,
		closeActiveTab,
		closeTabsForPathRemoval,
		renameTabsForPath,
		reorderTabs,
		openBlankTab,
		openBlankTabInPane,
		openFileInPane,
		splitPaneWithFile,
		splitPaneWithBlank,
		moveTabToPane,
		resizeSplit,
		replaceActiveTabWithBlank,
		openFileTab,
		openSpecialTab,
		restoreWorkspaceTabs,
		canGoBack,
		canGoForward,
		goBack,
		goForward,
		goBackInPane,
		goForwardInPane,
		activateNextTab,
		activatePreviousTab,
		activateTabByIndex,
		tabsRevision,
	};
}
