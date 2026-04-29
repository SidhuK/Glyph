import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFileTreeContext, useUILayoutContext } from "../../contexts";
import { useRecentFiles } from "../../hooks/useRecentFiles";
import { isInAppPreviewable } from "../../utils/filePreview";
import { isMarkdownPath } from "../../utils/path";

export interface WorkspaceTab {
	id: string;
	kind: "blank" | "file" | "special";
	target: string | null;
}

type NoteHistoryEntry = {
	path: string;
};

type TabNoteHistory = {
	entries: NoteHistoryEntry[];
	index: number;
};

type TabHistoryById = Record<string, TabNoteHistory>;

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
	const {
		setActivePreviewPath,
		setOpenMarkdownTabs,
		setActiveMarkdownTabPath,
		zenModeActive,
		setZenModeActive,
	} = useUILayoutContext();

	const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
	const [activeTabId, setActiveTabIdState] = useState<string | null>(null);
	const [dirtyByPath, setDirtyByPath] = useState<Record<string, boolean>>({});
	const [historyByTabId, setHistoryByTabId] = useState<TabHistoryById>({});
	const tabIdCounterRef = useRef(0);
	const tabsRef = useRef<WorkspaceTab[]>([]);
	const activeTabIdRef = useRef<string | null>(null);
	const historyByTabIdRef = useRef<TabHistoryById>({});

	tabsRef.current = tabs;
	activeTabIdRef.current = activeTabId;
	historyByTabIdRef.current = historyByTabId;

	const createTab = useCallback(
		(kind: WorkspaceTab["kind"], target: string | null): WorkspaceTab => ({
			id: `workspace-tab-${++tabIdCounterRef.current}`,
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
			const nextPreviewPath =
				nextFilePath &&
				!nextFilePath.toLowerCase().endsWith(".md") &&
				isInAppPreviewable(nextFilePath)
					? nextFilePath
					: null;
			const nextMarkdownTabs = nextTabs
				.filter(
					(tab) =>
						tab.kind === "file" && tab.target?.toLowerCase().endsWith(".md"),
				)
				.map((tab) => tab.target as string);
			const nextActiveMarkdownPath =
				nextActiveTab?.kind === "file" &&
				nextActiveTab.target?.toLowerCase().endsWith(".md")
					? nextActiveTab.target
					: null;

			setActiveFilePath(nextFilePath);
			setActivePreviewPath(nextPreviewPath);
			setOpenMarkdownTabs(nextMarkdownTabs);
			setActiveMarkdownTabPath(nextActiveMarkdownPath);

			const targetChanged = previousActiveTarget !== nextActiveTab?.target;

			if (zenModeActive && !nextActiveMarkdownPath && targetChanged) {
				setZenModeActive(false);
			}

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
			setActivePreviewPath,
			setOpenMarkdownTabs,
			setZenModeActive,
			spacePath,
			zenModeActive,
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
			setTabs(nextTabs);
			setActiveTabIdState(nextActiveTabId);
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

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset tab state when the active space changes.
	useEffect(() => {
		tabsRef.current = [];
		activeTabIdRef.current = null;
		historyByTabIdRef.current = {};
		setTabs([]);
		setActiveTabIdState(null);
		setDirtyByPath({});
		setHistoryByTabId({});
	}, [spacePath]);

	const focusExistingTab = useCallback(
		(target: string) => {
			const existing = tabs.find((tab) => tab.target === target);
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
		(path: string) =>
			path.toLowerCase().endsWith(".md") || isInAppPreviewable(path),
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
					: (nextTabs[index]?.id ?? nextTabs[index - 1]?.id ?? null);
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
			commitTabsChange(nextTabs, nextActiveTabId);
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
		[commitTabsChange, updateHistoryState],
	);

	const closeAllTabs = useCallback(() => {
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
			const next = [...currentTabs];
			const [moved] = next.splice(fromIndex, 1);
			next.splice(toIndex, 0, moved);
			commitTabsChange(next, activeTabIdRef.current);
		},
		[commitTabsChange],
	);

	const activateNextTab = useCallback(() => {
		if (!tabsRef.current.length) return;
		const currentIndex = activeTabIdRef.current
			? tabsRef.current.findIndex((tab) => tab.id === activeTabIdRef.current)
			: -1;
		const nextIndex = (Math.max(currentIndex, -1) + 1) % tabsRef.current.length;
		setActiveTabId(tabsRef.current[nextIndex]?.id ?? null);
	}, [setActiveTabId]);

	const activatePreviousTab = useCallback(() => {
		if (!tabsRef.current.length) return;
		const currentIndex = activeTabIdRef.current
			? tabsRef.current.findIndex((tab) => tab.id === activeTabIdRef.current)
			: 0;
		const nextIndex =
			(currentIndex - 1 + tabsRef.current.length) % tabsRef.current.length;
		setActiveTabId(tabsRef.current[nextIndex]?.id ?? null);
	}, [setActiveTabId]);

	const activateTabByIndex = useCallback(
		(index: number) => {
			const tab = tabsRef.current[index];
			if (!tab) return false;
			setActiveTabId(tab.id);
			return true;
		},
		[setActiveTabId],
	);

	return {
		tabs,
		activeTab,
		activeTabId,
		activeTabPath,
		setActiveTabId,
		dirtyByPath,
		setDirtyByPath,
		closeTab,
		closeAllTabs,
		closeActiveTab,
		closeTabsForPathRemoval,
		renameTabsForPath,
		reorderTabs,
		openBlankTab,
		replaceActiveTabWithBlank,
		openFileTab,
		openSpecialTab,
		canGoBack,
		canGoForward,
		goBack,
		goForward,
		activateNextTab,
		activatePreviousTab,
		activateTabByIndex,
	};
}
