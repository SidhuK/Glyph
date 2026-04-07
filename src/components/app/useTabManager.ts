import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useFileTreeContext, useUILayoutContext } from "../../contexts";
import { useRecentFiles } from "../../hooks/useRecentFiles";
import { isInAppPreviewable } from "../../utils/filePreview";

export interface WorkspaceTab {
	id: string;
	kind: "blank" | "file" | "special";
	target: string | null;
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
	const {
		setActivePreviewPath,
		setOpenMarkdownTabs,
		setActiveMarkdownTabPath,
	} = useUILayoutContext();

	const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
	const [activeTabId, setActiveTabId] = useState<string | null>(null);
	const [dragTabId, setDragTabId] = useState<string | null>(null);
	const [dirtyByPath, setDirtyByPath] = useState<Record<string, boolean>>({});
	const tabIdCounterRef = useRef(0);
	const tabsRef = useRef<WorkspaceTab[]>([]);
	const activeTabIdRef = useRef<string | null>(null);

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

	useLayoutEffect(() => {
		void spacePath;
		setTabs([]);
		setActiveTabId(null);
		setDragTabId(null);
		setDirtyByPath({});
		tabsRef.current = [];
		activeTabIdRef.current = null;
	}, [spacePath]);

	useEffect(() => {
		tabsRef.current = tabs;
	}, [tabs]);

	useEffect(() => {
		activeTabIdRef.current = activeTabId;
	}, [activeTabId]);

	const derivedFilePath = useMemo(() => {
		if (!activeTab || activeTab.kind !== "file" || !activeTab.target)
			return null;
		return activeTab.target;
	}, [activeTab]);

	const derivedPreviewPath = useMemo(() => {
		if (!derivedFilePath) return null;
		if (derivedFilePath.toLowerCase().endsWith(".md")) return null;
		if (isInAppPreviewable(derivedFilePath)) return derivedFilePath;
		return null;
	}, [derivedFilePath]);

	const derivedMarkdownTabs = useMemo(
		() =>
			tabs
				.filter(
					(tab) =>
						tab.kind === "file" && tab.target?.toLowerCase().endsWith(".md"),
				)
				.map((tab) => tab.target as string),
		[tabs],
	);

	const derivedActiveMarkdownPath = useMemo(() => {
		if (
			activeTab?.kind === "file" &&
			activeTab.target?.toLowerCase().endsWith(".md")
		)
			return activeTab.target;
		return null;
	}, [activeTab]);

	useEffect(() => {
		setActiveFilePath(derivedFilePath);
		setActivePreviewPath(derivedPreviewPath);
		setOpenMarkdownTabs(derivedMarkdownTabs);
		setActiveMarkdownTabPath(derivedActiveMarkdownPath);
	}, [
		derivedFilePath,
		derivedPreviewPath,
		derivedMarkdownTabs,
		derivedActiveMarkdownPath,
		setActiveFilePath,
		setActivePreviewPath,
		setOpenMarkdownTabs,
		setActiveMarkdownTabPath,
	]);

	useEffect(() => {
		if (activeTab?.kind === "file" && activeTab.target && spacePath) {
			void addRecentFile(activeTab.target, spacePath);
		}
	}, [activeTab, addRecentFile, spacePath]);

	const focusExistingTab = useCallback(
		(target: string) => {
			const existing = tabs.find((tab) => tab.target === target);
			if (!existing) return false;
			setActiveTabId(existing.id);
			return true;
		},
		[tabs],
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

	const replaceActiveTab = useCallback(
		(kind: WorkspaceTab["kind"], target: string | null) => {
			const nextTab = createTab(kind, target);
			setTabs((prev) => {
				if (!activeTabId) return [nextTab];
				const activeIndex = prev.findIndex((tab) => tab.id === activeTabId);
				if (activeIndex === -1) return [...prev, nextTab];
				const current = prev[activeIndex];
				if (current?.kind === "file") {
					clearDirtyForTarget(current.target);
				}
				const next = [...prev];
				next[activeIndex] = nextTab;
				return next;
			});
			setActiveTabId(nextTab.id);
		},
		[activeTabId, clearDirtyForTarget, createTab],
	);

	const canOpenInMainPane = useCallback(
		(path: string) =>
			path.toLowerCase().endsWith(".md") || isInAppPreviewable(path),
		[],
	);

	const openFileTab = useCallback(
		(path: string) => {
			if (!canOpenInMainPane(path)) return false;
			if (focusExistingTab(path)) return true;
			replaceActiveTab("file", path);
			return true;
		},
		[canOpenInMainPane, focusExistingTab, replaceActiveTab],
	);

	const openSpecialTab = useCallback(
		(target: string) => {
			if (focusExistingTab(target)) return;
			replaceActiveTab("special", target);
		},
		[focusExistingTab, replaceActiveTab],
	);

	const openBlankTab = useCallback(() => {
		const blankTab = createTab("blank", null);
		setTabs((prev) => [...prev, blankTab]);
		setActiveTabId(blankTab.id);
	}, [createTab]);

	const replaceActiveTabWithBlank = useCallback(() => {
		if (activeTab?.kind === "blank") return;
		replaceActiveTab("blank", null);
	}, [activeTab?.kind, replaceActiveTab]);

	const closeTab = useCallback(
		(tabId: string) => {
			const currentTabs = tabsRef.current;
			const index = currentTabs.findIndex((tab) => tab.id === tabId);
			if (index === -1) return;
			const removed = currentTabs[index];
			const nextTabs = currentTabs.filter((tab) => tab.id !== tabId);
			const nextActiveTabId =
				activeTabIdRef.current !== tabId
					? activeTabIdRef.current
					: (nextTabs[index]?.id ?? nextTabs[index - 1]?.id ?? null);
			if (removed?.kind === "file") {
				clearDirtyForTarget(removed.target);
			}
			tabsRef.current = nextTabs;
			activeTabIdRef.current = nextActiveTabId;
			setTabs(nextTabs);
			setActiveTabId(nextActiveTabId);
		},
		[clearDirtyForTarget],
	);

	const closeAllTabs = useCallback(() => {
		setTabs([]);
		setActiveTabId(null);
		setDirtyByPath({});
	}, []);

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
			if (nextTabs.length === currentTabs.length) return;
			const currentActiveTabId = activeTabIdRef.current;
			let nextActiveTabId = currentActiveTabId;
			if (currentActiveTabId) {
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
			tabsRef.current = nextTabs;
			activeTabIdRef.current = nextActiveTabId;
			setTabs(nextTabs);
			setActiveTabId(nextActiveTabId);
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
		[],
	);

	const renameTabsForPath = useCallback(
		(fromPath: string, toPath: string, recursive = false) => {
			setTabs((prev) => {
				let changed = false;
				const next = prev.map((tab) => {
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
				return changed ? next : prev;
			});
			setDirtyByPath((prev) => {
				let changed = false;
				const next: Record<string, boolean> = {};
				for (const [tabPath, dirty] of Object.entries(prev)) {
					if (tabPath === fromPath) {
						next[toPath] = dirty;
						changed = true;
						continue;
					}
					if (recursive && tabPath.startsWith(`${fromPath}/`)) {
						next[`${toPath}${tabPath.slice(fromPath.length)}`] = dirty;
						changed = true;
						continue;
					}
					next[tabPath] = dirty;
				}
				return changed ? next : prev;
			});
		},
		[],
	);

	const reorderTabs = useCallback((fromTabId: string, toTabId: string) => {
		if (!fromTabId || !toTabId || fromTabId === toTabId) return;
		setTabs((prev) => {
			const fromIndex = prev.findIndex((tab) => tab.id === fromTabId);
			const toIndex = prev.findIndex((tab) => tab.id === toTabId);
			if (fromIndex === -1 || toIndex === -1) return prev;
			const next = [...prev];
			const [moved] = next.splice(fromIndex, 1);
			next.splice(toIndex, 0, moved);
			return next;
		});
	}, []);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const mod = event.metaKey || event.ctrlKey;
			if (!mod) return;
			const key = event.key.toLowerCase();
			if (key === "tab") {
				if (!tabs.length) return;
				event.preventDefault();
				const currentIndex = activeTabId
					? tabs.findIndex((tab) => tab.id === activeTabId)
					: -1;
				const step = event.shiftKey ? -1 : 1;
				const base = currentIndex >= 0 ? currentIndex : event.shiftKey ? 0 : -1;
				const nextIndex = (base + step + tabs.length) % tabs.length;
				setActiveTabId(tabs[nextIndex]?.id ?? null);
				return;
			}
			if (key === "w" && event.shiftKey) {
				event.preventDefault();
				closeAllTabs();
				return;
			}
			if (key === "w") {
				event.preventDefault();
				closeActiveTab();
				return;
			}
			if (!event.shiftKey && /^[1-9]$/.test(key)) {
				const index = Number.parseInt(key, 10) - 1;
				const tab = tabs[index];
				if (!tab) return;
				event.preventDefault();
				setActiveTabId(tab.id);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [activeTabId, closeActiveTab, closeAllTabs, tabs]);

	return {
		tabs,
		activeTab,
		activeTabId,
		activeTabPath,
		setActiveTabId,
		dragTabId,
		setDragTabId,
		dirtyByPath,
		setDirtyByPath,
		closeTab,
		closeActiveTab,
		closeTabsForPathRemoval,
		renameTabsForPath,
		reorderTabs,
		openBlankTab,
		replaceActiveTabWithBlank,
		openFileTab,
		openSpecialTab,
	};
}
