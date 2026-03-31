import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

	useEffect(() => {
		void spacePath;
		setTabs([]);
		setActiveTabId(null);
		setDragTabId(null);
		setDirtyByPath({});
	}, [spacePath]);

	useEffect(() => {
		if (!activeTab || activeTab.kind !== "file" || !activeTab.target) {
			setActivePreviewPath(null);
			setActiveFilePath(null);
			return;
		}
		setActiveFilePath(activeTab.target);
		if (activeTab.target.toLowerCase().endsWith(".md")) {
			setActivePreviewPath(null);
			return;
		}
		if (isInAppPreviewable(activeTab.target)) {
			setActivePreviewPath(activeTab.target);
			return;
		}
		setActivePreviewPath(null);
	}, [activeTab, setActiveFilePath, setActivePreviewPath]);

	useEffect(() => {
		const markdownTabs = tabs
			.filter(
				(tab) =>
					tab.kind === "file" && tab.target?.toLowerCase().endsWith(".md"),
			)
			.map((tab) => tab.target as string);
		setOpenMarkdownTabs(markdownTabs);
		const activeMarkdown =
			activeTab?.kind === "file" &&
			activeTab.target?.toLowerCase().endsWith(".md")
				? activeTab.target
				: null;
		setActiveMarkdownTabPath(activeMarkdown);
	}, [activeTab, setActiveMarkdownTabPath, setOpenMarkdownTabs, tabs]);

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
			setTabs((prev) => {
				const index = prev.findIndex((tab) => tab.id === tabId);
				if (index === -1) return prev;
				const removed = prev[index];
				const next = prev.filter((tab) => tab.id !== tabId);
				if (removed?.kind === "file") {
					clearDirtyForTarget(removed.target);
				}
				setActiveTabId((current) => {
					if (current !== tabId) return current;
					return next[index]?.id ?? next[index - 1]?.id ?? null;
				});
				return next;
			});
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
			setTabs((prev) => {
				const next = prev.filter(
					(tab) => !matchesRemovedPath(tab, path, recursive),
				);
				if (next.length === prev.length) return prev;
				setActiveTabId((current) => {
					if (!current) return current;
					const removedIndex = prev.findIndex((tab) => tab.id === current);
					const removedTab = removedIndex >= 0 ? prev[removedIndex] : null;
					if (!removedTab || !matchesRemovedPath(removedTab, path, recursive)) {
						return current;
					}
					return next[removedIndex]?.id ?? next[removedIndex - 1]?.id ?? null;
				});
				return next;
			});
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
