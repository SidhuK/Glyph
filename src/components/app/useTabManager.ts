import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFileTreeContext, useUILayoutContext } from "../../contexts";
import { useRecentFiles } from "../../hooks/useRecentFiles";
import { isMarkdownPath } from "../../utils/path";
import {
	MAX_SPLIT_RATIO,
	MIN_SPLIT_RATIO,
	PRIMARY_EDITOR_PANE_ID,
	createInitialSplitEditorLayout,
	paneIdsInLayout,
	removeEditorPane,
	splitEditorPane,
	updateSplitRatio,
} from "./splitEditorModel";
import type {
	SplitDropEdge,
	SplitEditorNode,
} from "./splitEditorModel";

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

type TabHistoryById = Record<string, TabNoteHistory>;

interface RestoredWorkspaceTab {
	kind: "file" | "special";
	target: string;
	paneId?: string;
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

export function useTabManager(spacePath: string | null) {
	const { setActiveFilePath } = useFileTreeContext();
	const { addRecentFile } = useRecentFiles(spacePath, 7);
	const { setOpenMarkdownTabs, setActiveMarkdownTabPath } =
		useUILayoutContext();

	const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
	const [activeTabId, setActiveTabIdState] = useState<string | null>(null);
	const [splitLayout, setSplitLayout] = useState<SplitEditorNode>(
		createInitialSplitEditorLayout,
	);
	const [focusedPaneId, setFocusedPaneIdState] = useState(
		PRIMARY_EDITOR_PANE_ID,
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
	const focusedPaneIdRef = useRef(PRIMARY_EDITOR_PANE_ID);
	const activeTabByPaneRef = useRef<Record<string, string | null>>({
		[PRIMARY_EDITOR_PANE_ID]: null,
	});
	const historyByTabIdRef = useRef<TabHistoryById>({});

	tabsRef.current = tabs;
	activeTabIdRef.current = activeTabId;
	historyByTabIdRef.current = historyByTabId;

	const createTab = useCallback(
		(
			kind: WorkspaceTab["kind"],
			target: string | null,
			paneId = focusedPaneIdRef.current,
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
			const nextMarkdownTabs = nextTabs
				.filter(
					(tab) =>
						tab.kind === "file" &&
						tab.target !== null &&
						isMarkdownPath(tab.target),
				)
				.map((tab) => tab.target as string);
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
				focusedPaneIdRef.current;
			const nextActiveByPane = {
				...activeTabByPaneRef.current,
				[nextActivePaneId]: nextActiveTabId,
			};
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
			const paneId = tabsRef.current.find(
				(tab) => tab.id === nextActiveTabId,
			)?.paneId;
			if (paneId) {
				focusedPaneIdRef.current = paneId;
				setFocusedPaneIdState(paneId);
			}
			commitTabsChange(tabsRef.current, nextActiveTabId);
		},
		[commitTabsChange],
	);

	const focusPane = useCallback(
		(paneId: string) => {
			if (focusedPaneIdRef.current === paneId) return;
			focusedPaneIdRef.current = paneId;
			setFocusedPaneIdState(paneId);
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
		focusedPaneIdRef.current = PRIMARY_EDITOR_PANE_ID;
		activeTabByPaneRef.current = { [PRIMARY_EDITOR_PANE_ID]: null };
		setTabs([]);
		setActiveTabIdState(null);
		setSplitLayout(createInitialSplitEditorLayout());
		setFocusedPaneIdState(PRIMARY_EDITOR_PANE_ID);
		setActiveTabByPane({ [PRIMARY_EDITOR_PANE_ID]: null });
		setDirtyByPath({});
		setHistoryByTabId({});
		setTabsRevision(0);
	}, [spacePath]);

	const focusExistingTab = useCallback(
		(target: string) => {
			const existing = tabs.find(
				(tab) =>
					tab.paneId === focusedPaneIdRef.current && tab.target === target,
			);
			if (!existing) return false;
			setActiveTabId(existing.id);
			return true;
		},
		[setActiveTabId, tabs],
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

	const goBack = useCallback(() => {
		const activeId = activeTabIdRef.current;
		if (!activeId) return;
		const path = stepHistory(activeId, -1);
		if (!path) return;
		updateActiveTabInPlace("file", path);
	}, [stepHistory, updateActiveTabInPlace]);

	const goForward = useCallback(() => {
		const activeId = activeTabIdRef.current;
		if (!activeId) return;
		const path = stepHistory(activeId, 1);
		if (!path) return;
		updateActiveTabInPlace("file", path);
	}, [stepHistory, updateActiveTabInPlace]);

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
			if (focusExistingTab(path)) return true;

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
			focusExistingTab,
			pushNoteHistory,
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
			const nextLayout =
				restoredLayout ?? createInitialSplitEditorLayout();
			const layoutPaneIds = new Set(paneIdsInLayout(nextLayout));
			const fallbackPaneId =
				paneIdsInLayout(nextLayout)[0] ?? PRIMARY_EDITOR_PANE_ID;
			const seenTargets = new Set<string>();
			const nextTabs: WorkspaceTab[] = [];
			const nextHistory: TabHistoryById = {};

			for (const snapshot of tabSnapshots) {
				const paneId =
					snapshot.paneId && layoutPaneIds.has(snapshot.paneId)
						? snapshot.paneId
					: fallbackPaneId;
				const targetKey = `${paneId}\0${snapshot.target}`;
				if (seenTargets.has(targetKey)) continue;
				seenTargets.add(targetKey);
				const tab = createTab(
					snapshot.kind,
					snapshot.target,
					paneId,
				);
				nextTabs.push(tab);
				if (snapshot.kind === "file" && isMarkdownPath(snapshot.target)) {
					nextHistory[tab.id] = {
						entries: [{ path: snapshot.target }],
						index: 0,
					};
				}
			}

			const nextActiveByPane: Record<string, string | null> = {};
			for (const paneId of layoutPaneIds) {
				const target = activeTabTargetByPane[paneId];
				nextActiveByPane[paneId] =
					nextTabs.find(
						(tab) => tab.paneId === paneId && tab.target === target,
					)?.id ??
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
			focusedPaneIdRef.current = nextFocusedPaneId;
			activeTabByPaneRef.current = nextActiveByPane;
			setSplitLayout(nextLayout);
			setFocusedPaneIdState(nextFocusedPaneId);
			setActiveTabByPane(nextActiveByPane);
			setHistoryByTabId(nextHistory);
			setDirtyByPath({});
			commitTabsChange(nextTabs, nextActiveTabId);
		},
		[commitTabsChange, createTab],
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
			const nextTabs = currentTabs.filter((tab) => tab.id !== tabId);
			const nextActiveTabId =
				activeTabIdRef.current !== tabId
					? activeTabIdRef.current
					: (nextTabs.find(
							(tab) =>
								tab.paneId === removed?.paneId &&
								currentTabs.indexOf(tab) > index,
						)?.id ??
						[...nextTabs]
							.reverse()
							.find(
								(tab) =>
									tab.paneId === removed?.paneId &&
									currentTabs.indexOf(tab) < index,
							)?.id ??
						null);
			const removedPaneId = removed?.paneId;
			if (
				removedPaneId &&
				activeTabByPaneRef.current[removedPaneId] === tabId
			) {
				const replacementTabId =
					nextTabs.find(
						(tab) =>
							tab.paneId === removedPaneId &&
							currentTabs.indexOf(tab) > index,
					)?.id ??
					[...nextTabs]
						.reverse()
						.find(
							(tab) =>
								tab.paneId === removedPaneId &&
								currentTabs.indexOf(tab) < index,
						)?.id ??
					null;
				activeTabByPaneRef.current = {
					...activeTabByPaneRef.current,
					[removedPaneId]: replacementTabId,
				};
			}
			const paneIsEmpty =
				removedPaneId &&
				!nextTabs.some((tab) => tab.paneId === removedPaneId) &&
				paneIdsInLayout(splitLayout).length > 1;
			let committedActiveTabId = nextActiveTabId;
			if (paneIsEmpty && removedPaneId) {
				const nextLayout = removeEditorPane(splitLayout, removedPaneId);
				if (nextLayout) {
					setSplitLayout(nextLayout);
					const fallbackPaneId =
						paneIdsInLayout(nextLayout)[0] ?? PRIMARY_EDITOR_PANE_ID;
					focusedPaneIdRef.current = fallbackPaneId;
					setFocusedPaneIdState(fallbackPaneId);
					committedActiveTabId =
						activeTabByPaneRef.current[fallbackPaneId] ??
						nextTabs.find((tab) => tab.paneId === fallbackPaneId)?.id ??
						null;
				}
				const nextActiveByPane = { ...activeTabByPaneRef.current };
				delete nextActiveByPane[removedPaneId];
				activeTabByPaneRef.current = nextActiveByPane;
				setActiveTabByPane(nextActiveByPane);
			}
			if (removedTarget) {
				setDirtyByPath((prev) => {
					if (!(removedTarget in prev)) return prev;
					const next = { ...prev };
					delete next[removedTarget];
					return next;
				});
			}
			updateHistoryState((prev) => {
				if (!(tabId in prev)) return prev;
				const next = { ...prev };
				delete next[tabId];
				return next;
			});
			commitTabsChange(nextTabs, committedActiveTabId);
			setDirtyByPath((prev) => {
				let changed = false;
				const next: Record<string, boolean> = {};
				for (const [tabPath, dirty] of Object.entries(prev)) {
					if (
						removedTarget &&
						(tabPath === removedTarget ||
							tabPath.startsWith(`${removedTarget}/`))
					) {
						changed = true;
						continue;
					}
					next[tabPath] = dirty;
				}
				return changed ? next : prev;
			});
		},
		[commitTabsChange, splitLayout, updateHistoryState],
	);

	const closeAllTabs = useCallback(() => {
		focusedPaneIdRef.current = PRIMARY_EDITOR_PANE_ID;
		activeTabByPaneRef.current = { [PRIMARY_EDITOR_PANE_ID]: null };
		setSplitLayout(createInitialSplitEditorLayout());
		setFocusedPaneIdState(PRIMARY_EDITOR_PANE_ID);
		setActiveTabByPane({ [PRIMARY_EDITOR_PANE_ID]: null });
		commitTabsChange([], null);
		setDirtyByPath({});
		historyByTabIdRef.current = {};
		setHistoryByTabId({});
	}, [commitTabsChange]);

	const closeActiveTab = useCallback(() => {
		if (!activeTabId) return;
		closeTab(activeTabId);
	}, [activeTabId, closeTab]);

	const closeTabsForPathRemoval = useCallback(
		(path: string, recursive = false) => {
			const currentTabs = tabsRef.current;
			const nextTabs = currentTabs.filter(
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
			if (tabsRemoved && currentActiveTabId) {
				const removedIndex = currentTabs.findIndex(
					(tab) => tab.id === currentActiveTabId,
				);
				const removedTab = removedIndex >= 0 ? currentTabs[removedIndex] : null;
				if (removedTab && matchesRemovedPath(removedTab, path, recursive)) {
					const survivingTabIds = new Set(nextTabs.map((tab) => tab.id));
					nextActiveTabId = null;
					for (
						let index = removedIndex + 1;
						index < currentTabs.length;
						index++
					) {
						const candidate = currentTabs[index];
						if (!survivingTabIds.has(candidate.id)) continue;
						nextActiveTabId = candidate.id;
						break;
					}
					if (!nextActiveTabId) {
						for (let index = removedIndex - 1; index >= 0; index--) {
							const candidate = currentTabs[index];
							if (!survivingTabIds.has(candidate.id)) continue;
							nextActiveTabId = candidate.id;
							break;
						}
					}
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
		[commitTabsChange, updateHistoryState],
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
		const paneTabs = tabsRef.current.filter(
			(tab) => tab.paneId === focusedPaneIdRef.current,
		);
		if (!paneTabs.length) return;
		const currentIndex = activeTabIdRef.current
			? paneTabs.findIndex((tab) => tab.id === activeTabIdRef.current)
			: -1;
		const nextIndex = (Math.max(currentIndex, -1) + 1) % paneTabs.length;
		setActiveTabId(paneTabs[nextIndex]?.id ?? null);
	}, [setActiveTabId]);

	const activatePreviousTab = useCallback(() => {
		const paneTabs = tabsRef.current.filter(
			(tab) => tab.paneId === focusedPaneIdRef.current,
		);
		if (!paneTabs.length) return;
		const currentIndex = activeTabIdRef.current
			? paneTabs.findIndex((tab) => tab.id === activeTabIdRef.current)
			: 0;
		const nextIndex =
			(currentIndex - 1 + paneTabs.length) % paneTabs.length;
		setActiveTabId(paneTabs[nextIndex]?.id ?? null);
	}, [setActiveTabId]);

	const activateTabByIndex = useCallback(
		(index: number) => {
			const tab = tabsRef.current.filter(
				(candidate) => candidate.paneId === focusedPaneIdRef.current,
			)[index];
			if (!tab) return false;
			setActiveTabId(tab.id);
			return true;
		},
		[setActiveTabId],
	);

	const openBlankTabInPane = useCallback(
		(paneId: string) => {
			focusedPaneIdRef.current = paneId;
			setFocusedPaneIdState(paneId);
			const blankTab = createTab("blank", null, paneId);
			commitTabsChange([...tabsRef.current, blankTab], blankTab.id);
		},
		[commitTabsChange, createTab],
	);

	const openFileInPane = useCallback(
		(path: string, paneId: string) => {
			if (!canOpenInMainPane(path)) return false;
			focusedPaneIdRef.current = paneId;
			setFocusedPaneIdState(paneId);
			const existing = tabsRef.current.find(
				(tab) => tab.paneId === paneId && tab.target === path,
			);
			if (existing) {
				commitTabsChange(tabsRef.current, existing.id);
				return true;
			}
			const paneActiveId = activeTabByPaneRef.current[paneId] ?? null;
			const paneActive = tabsRef.current.find(
				(tab) => tab.id === paneActiveId && tab.paneId === paneId,
			);
			let tab: WorkspaceTab;
			let nextTabs: WorkspaceTab[];
			if (paneActive?.kind === "blank") {
				tab = { ...paneActive, kind: "file", target: path };
				nextTabs = tabsRef.current.map((candidate) =>
					candidate.id === tab.id ? tab : candidate,
				);
				clearHistoryForTab(tab.id);
			} else {
				tab = createTab("file", path, paneId);
				nextTabs = [...tabsRef.current, tab];
			}
			pushNoteHistory(tab.id, path);
			commitTabsChange(nextTabs, tab.id);
			return true;
		},
		[
			canOpenInMainPane,
			clearHistoryForTab,
			commitTabsChange,
			createTab,
			pushNoteHistory,
		],
	);

	const splitPaneWithFile = useCallback(
		(paneId: string, edge: SplitDropEdge, path: string) => {
			if (!canOpenInMainPane(path)) return;
			const newPaneId = `editor-pane-${crypto.randomUUID()}`;
			const nextLayout = splitEditorPane(
				splitLayout,
				paneId,
				newPaneId,
				`editor-split-${crypto.randomUUID()}`,
				edge,
			);
			if (nextLayout === splitLayout) return;
			const tab = createTab("file", path, newPaneId);
			setSplitLayout(nextLayout);
			focusedPaneIdRef.current = newPaneId;
			setFocusedPaneIdState(newPaneId);
			activeTabByPaneRef.current = {
				...activeTabByPaneRef.current,
				[newPaneId]: tab.id,
			};
			setActiveTabByPane(activeTabByPaneRef.current);
			pushNoteHistory(tab.id, path);
			commitTabsChange([...tabsRef.current, tab], tab.id);
		},
		[
			canOpenInMainPane,
			commitTabsChange,
			createTab,
			pushNoteHistory,
			splitLayout,
		],
	);

	const splitPaneWithBlank = useCallback(
		(edge: SplitDropEdge) => {
			const paneId = focusedPaneIdRef.current;
			const newPaneId = `editor-pane-${crypto.randomUUID()}`;
			const nextLayout = splitEditorPane(
				splitLayout,
				paneId,
				newPaneId,
				`editor-split-${crypto.randomUUID()}`,
				edge,
			);
			if (nextLayout === splitLayout) return;
			const blankTab = createTab("blank", null, newPaneId);
			setSplitLayout(nextLayout);
			focusedPaneIdRef.current = newPaneId;
			setFocusedPaneIdState(newPaneId);
			activeTabByPaneRef.current = {
				...activeTabByPaneRef.current,
				[newPaneId]: blankTab.id,
			};
			setActiveTabByPane(activeTabByPaneRef.current);
			commitTabsChange([...tabsRef.current, blankTab], blankTab.id);
		},
		[commitTabsChange, createTab, splitLayout],
	);

	const moveTabToPane = useCallback(
		(
			tabId: string,
			targetPaneId: string,
			edge: SplitDropEdge | "center",
		) => {
			const sourceTab = tabsRef.current.find((tab) => tab.id === tabId);
			if (!sourceTab) return;

			if (edge === "center") {
				if (sourceTab.paneId === targetPaneId) {
					setActiveTabId(tabId);
					return;
				}
				const existing = sourceTab.target
					? tabsRef.current.find(
							(tab) =>
								tab.paneId === targetPaneId &&
								tab.target === sourceTab.target &&
								tab.kind === sourceTab.kind,
						)
					: null;
				if (existing) {
					setActiveTabId(existing.id);
					closeTab(tabId);
					return;
				}
				const nextTabs = tabsRef.current.map((tab) =>
					tab.id === tabId ? { ...tab, paneId: targetPaneId } : tab,
				);
				const sourcePaneIsEmpty = !nextTabs.some(
					(tab) => tab.paneId === sourceTab.paneId,
				);
				if (sourcePaneIsEmpty && paneIdsInLayout(splitLayout).length > 1) {
					const nextLayout = removeEditorPane(
						splitLayout,
						sourceTab.paneId,
					);
					if (nextLayout) setSplitLayout(nextLayout);
					const nextActiveByPane = { ...activeTabByPaneRef.current };
					delete nextActiveByPane[sourceTab.paneId];
					activeTabByPaneRef.current = nextActiveByPane;
				} else if (
					activeTabByPaneRef.current[sourceTab.paneId] === tabId
				) {
					activeTabByPaneRef.current = {
						...activeTabByPaneRef.current,
						[sourceTab.paneId]:
							nextTabs.find(
								(tab) => tab.paneId === sourceTab.paneId,
							)?.id ?? null,
					};
				}
				focusedPaneIdRef.current = targetPaneId;
				setFocusedPaneIdState(targetPaneId);
				commitTabsChange(nextTabs, tabId);
				return;
			}

			const newPaneId = `editor-pane-${crypto.randomUUID()}`;
			const nextLayout = splitEditorPane(
				splitLayout,
				targetPaneId,
				newPaneId,
				`editor-split-${crypto.randomUUID()}`,
				edge,
			);
			if (nextLayout === splitLayout) return;
			const sourcePaneTabs = tabsRef.current.filter(
				(tab) => tab.paneId === sourceTab.paneId,
			);
			let nextTab = sourceTab;
			let nextTabs: WorkspaceTab[];
			if (sourcePaneTabs.length === 1) {
				const blankTab = createTab("blank", null, sourceTab.paneId);
				nextTab = { ...sourceTab, paneId: newPaneId };
				nextTabs = [
					...tabsRef.current.map((tab) =>
						tab.id === tabId ? nextTab : tab,
					),
					blankTab,
				];
				activeTabByPaneRef.current = {
					...activeTabByPaneRef.current,
					[sourceTab.paneId]: blankTab.id,
				};
			} else {
				nextTab = { ...sourceTab, paneId: newPaneId };
				nextTabs = tabsRef.current.map((tab) =>
					tab.id === tabId ? nextTab : tab,
				);
				if (activeTabByPaneRef.current[sourceTab.paneId] === tabId) {
					activeTabByPaneRef.current = {
						...activeTabByPaneRef.current,
						[sourceTab.paneId]:
							nextTabs.find(
								(tab) => tab.paneId === sourceTab.paneId,
							)?.id ?? null,
					};
				}
			}
			setSplitLayout(nextLayout);
			focusedPaneIdRef.current = newPaneId;
			setFocusedPaneIdState(newPaneId);
			commitTabsChange(nextTabs, nextTab.id);
		},
		[
			closeTab,
			commitTabsChange,
				createTab,
				setActiveTabId,
				splitLayout,
			],
		);

	const resizeSplit = useCallback((splitId: string, ratio: number) => {
		const clampedRatio = Math.min(
			MAX_SPLIT_RATIO,
			Math.max(MIN_SPLIT_RATIO, ratio),
		);
		setSplitLayout((current) =>
			updateSplitRatio(current, splitId, clampedRatio),
		);
		setTabsRevision((revision) => revision + 1);
	}, []);

	const goBackInPane = useCallback(
		(paneId: string) => {
			const tabId = activeTabByPaneRef.current[paneId];
			if (!tabId) return;
			focusedPaneIdRef.current = paneId;
			setFocusedPaneIdState(paneId);
			activeTabIdRef.current = tabId;
			const path = stepHistory(tabId, -1);
			if (!path) return;
			updateActiveTabInPlace("file", path);
		},
		[stepHistory, updateActiveTabInPlace],
	);

	const goForwardInPane = useCallback(
		(paneId: string) => {
			const tabId = activeTabByPaneRef.current[paneId];
			if (!tabId) return;
			focusedPaneIdRef.current = paneId;
			setFocusedPaneIdState(paneId);
			activeTabIdRef.current = tabId;
			const path = stepHistory(tabId, 1);
			if (!path) return;
			updateActiveTabInPlace("file", path);
		},
		[stepHistory, updateActiveTabInPlace],
	);

	const panes = useMemo<Record<string, WorkspaceEditorPane>>(() => {
		const result: Record<string, WorkspaceEditorPane> = {};
		for (const paneId of paneIdsInLayout(splitLayout)) {
			const paneTabs = tabs.filter((tab) => tab.paneId === paneId);
			const paneActiveTabId =
				activeTabByPane[paneId] ?? paneTabs[0]?.id ?? null;
			const paneActiveTab =
				paneTabs.find((tab) => tab.id === paneActiveTabId) ?? null;
			const history = paneActiveTabId
				? historyByTabId[paneActiveTabId]
				: undefined;
			result[paneId] = {
				id: paneId,
				tabs: paneTabs,
				activeTabId: paneActiveTabId,
				activeTabPath:
					paneActiveTab?.kind === "blank"
						? null
						: (paneActiveTab?.target ?? null),
				canGoBack: (history?.index ?? -1) > 0,
				canGoForward:
					(history?.index ?? -1) < (history?.entries.length ?? 0) - 1,
			};
		}
		return result;
	}, [activeTabByPane, historyByTabId, splitLayout, tabs]);

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
