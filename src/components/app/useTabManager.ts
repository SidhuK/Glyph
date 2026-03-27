import { useCallback, useEffect, useState } from "react";
import { useFileTreeContext, useUILayoutContext } from "../../contexts";
import { useRecentFiles } from "../../hooks/useRecentFiles";
import { CALENDAR_TAB_ID } from "../../lib/calendar";
import { DATABASES_TAB_ID } from "../../lib/databases";
import { isInAppPreviewable } from "../../utils/filePreview";

interface UseTabManagerOptions {
	onActivateTab?: (path: string) => void;
}

export function useTabManager(
	spacePath: string | null,
	options: UseTabManagerOptions = {},
) {
	const { onActivateTab } = options;
	const { activeFilePath, setActiveFilePath } = useFileTreeContext();
	const { recentFiles, addRecentFile } = useRecentFiles(spacePath, 7);
	const {
		activePreviewPath,
		setActivePreviewPath,
		setOpenMarkdownTabs,
		setActiveMarkdownTabPath,
	} = useUILayoutContext();

	const [openTabs, setOpenTabs] = useState<string[]>([]);
	const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
	const [dragTabPath, setDragTabPath] = useState<string | null>(null);
	const [dirtyByPath, setDirtyByPath] = useState<Record<string, boolean>>({});
	const isSpecialTab = useCallback(
		(path: string) => path === CALENDAR_TAB_ID || path === DATABASES_TAB_ID,
		[],
	);

	const canOpenInMainPane = useCallback(
		(path: string) =>
			path.toLowerCase().endsWith(".md") || isInAppPreviewable(path),
		[],
	);

	useEffect(() => {
		const opened = activePreviewPath ?? activeFilePath;
		if (!opened || !canOpenInMainPane(opened)) return;
		setOpenTabs((prev) => (prev.includes(opened) ? prev : [...prev, opened]));
		setActiveTabPath(opened);
	}, [activeFilePath, activePreviewPath, canOpenInMainPane]);

	useEffect(() => {
		if (!activeTabPath) return;
		onActivateTab?.(activeTabPath);
	}, [activeTabPath, onActivateTab]);

	useEffect(() => {
		if (!activeTabPath) {
			setActivePreviewPath(null);
			setActiveFilePath(null);
			return;
		}
		if (isSpecialTab(activeTabPath)) {
			setActivePreviewPath(null);
			setActiveFilePath(null);
			return;
		}
		setActiveFilePath(activeTabPath);
		if (activeTabPath.toLowerCase().endsWith(".md")) {
			setActivePreviewPath(null);
			return;
		}
		if (isInAppPreviewable(activeTabPath)) {
			setActivePreviewPath(activeTabPath);
			return;
		}
		setActivePreviewPath(null);
	}, [activeTabPath, isSpecialTab, setActiveFilePath, setActivePreviewPath]);

	useEffect(() => {
		const markdownTabs = openTabs.filter((p) =>
			p.toLowerCase().endsWith(".md"),
		);
		setOpenMarkdownTabs(markdownTabs);
		const activeMarkdown = activeTabPath?.toLowerCase().endsWith(".md")
			? activeTabPath
			: null;
		setActiveMarkdownTabPath(activeMarkdown);
	}, [activeTabPath, openTabs, setActiveMarkdownTabPath, setOpenMarkdownTabs]);

	useEffect(() => {
		if (activeTabPath && spacePath) {
			if (isSpecialTab(activeTabPath)) return;
			void addRecentFile(activeTabPath, spacePath);
		}
	}, [activeTabPath, isSpecialTab, spacePath, addRecentFile]);

	const closeTab = useCallback((path: string) => {
		setOpenTabs((prev) => {
			const idx = prev.indexOf(path);
			if (idx === -1) return prev;
			const next = prev.filter((p) => p !== path);
			setActiveTabPath((current) => {
				if (current !== path) return current;
				return next[idx] ?? next[idx - 1] ?? null;
			});
			return next;
		});
		setDirtyByPath((prev) => {
			if (!(path in prev)) return prev;
			const next = { ...prev };
			delete next[path];
			return next;
		});
	}, []);

	const closeAllTabs = useCallback(() => {
		setOpenTabs([]);
		setActiveTabPath(null);
		setDirtyByPath({});
	}, []);

	const closeActiveTab = useCallback(() => {
		if (!activeTabPath) return;
		closeTab(activeTabPath);
	}, [activeTabPath, closeTab]);

	const closeTabsForPathRemoval = useCallback(
		(path: string, recursive = false) => {
			setOpenTabs((prev) => {
				const next = prev.filter((tabPath) => {
					if (isSpecialTab(tabPath)) return true;
					if (tabPath === path) return false;
					return !(recursive && tabPath.startsWith(`${path}/`));
				});
				if (next.length === prev.length) return prev;
				setActiveTabPath((current) => {
					if (!current) return current;
					if (current === path) {
						const removedIndex = prev.indexOf(current);
						return next[removedIndex] ?? next[removedIndex - 1] ?? null;
					}
					if (recursive && current.startsWith(`${path}/`)) {
						const removedIndex = prev.indexOf(current);
						return next[removedIndex] ?? next[removedIndex - 1] ?? null;
					}
					return current;
				});
				return next;
			});
			setDirtyByPath((prev) => {
				let changed = false;
				const next: Record<string, boolean> = {};
				for (const [tabPath, dirty] of Object.entries(prev)) {
					const removed =
						tabPath === path || (recursive && tabPath.startsWith(`${path}/`));
					if (removed) {
						changed = true;
						continue;
					}
					next[tabPath] = dirty;
				}
				return changed ? next : prev;
			});
		},
		[isSpecialTab],
	);

	const renameTabsForPath = useCallback(
		(fromPath: string, toPath: string, recursive = false) => {
			setOpenTabs((prev) => {
				let changed = false;
				const next = prev.map((tabPath) => {
					if (isSpecialTab(tabPath)) return tabPath;
					if (tabPath === fromPath) {
						changed = true;
						return toPath;
					}
					if (recursive && tabPath.startsWith(`${fromPath}/`)) {
						changed = true;
						return `${toPath}${tabPath.slice(fromPath.length)}`;
					}
					return tabPath;
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
			setActiveTabPath((current) => {
				if (!current) return current;
				if (current === fromPath) return toPath;
				if (recursive && current.startsWith(`${fromPath}/`)) {
					return `${toPath}${current.slice(fromPath.length)}`;
				}
				return current;
			});
		},
		[isSpecialTab],
	);

	const reorderTabs = useCallback((fromPath: string, toPath: string) => {
		if (!fromPath || !toPath || fromPath === toPath) return;
		setOpenTabs((prev) => {
			const fromIndex = prev.indexOf(fromPath);
			const toIndex = prev.indexOf(toPath);
			if (fromIndex === -1 || toIndex === -1) return prev;
			const next = [...prev];
			const [moved] = next.splice(fromIndex, 1);
			next.splice(toIndex, 0, moved);
			return next;
		});
	}, []);

	const openSpecialTab = useCallback((tabId: string) => {
		setOpenTabs((prev) => (prev.includes(tabId) ? prev : [...prev, tabId]));
		setActiveTabPath(tabId);
	}, []);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const mod = event.metaKey || event.ctrlKey;
			if (!mod) return;
			const key = event.key.toLowerCase();
			if (key === "tab") {
				if (!openTabs.length) return;
				event.preventDefault();
				const currentIndex = activeTabPath
					? openTabs.indexOf(activeTabPath)
					: -1;
				const step = event.shiftKey ? -1 : 1;
				const base = currentIndex >= 0 ? currentIndex : event.shiftKey ? 0 : -1;
				const nextIndex = (base + step + openTabs.length) % openTabs.length;
				setActiveTabPath(openTabs[nextIndex] ?? null);
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
				const path = openTabs[index];
				if (!path) return;
				event.preventDefault();
				setActiveTabPath(path);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [activeTabPath, closeActiveTab, closeAllTabs, openTabs]);

	return {
		openTabs,
		activeTabPath,
		setActiveTabPath,
		dragTabPath,
		setDragTabPath,
		dirtyByPath,
		setDirtyByPath,
		closeTab,
		closeActiveTab,
		closeTabsForPathRemoval,
		renameTabsForPath,
		reorderTabs,
		openSpecialTab,
		recentFiles,
	};
}
