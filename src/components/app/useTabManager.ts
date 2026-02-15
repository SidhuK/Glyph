import { useCallback, useEffect, useState } from "react";
import {
	useFileTreeContext,
	useUILayoutContext,
	useViewContext,
} from "../../contexts";
import { useRecentFiles } from "../../hooks/useRecentFiles";
import { isInAppPreviewable } from "../../utils/filePreview";

export function useTabManager(vaultPath: string | null) {
	const { canvasLoadingMessage } = useViewContext();
	const { activeFilePath, setActiveFilePath } = useFileTreeContext();
	const { recentFiles, addRecentFile } = useRecentFiles(vaultPath, 7);
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
		if (!activeTabPath) {
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
	}, [activeTabPath, setActiveFilePath, setActivePreviewPath]);

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
		if (activeTabPath && vaultPath) {
			void addRecentFile(activeTabPath, vaultPath);
		}
	}, [activeTabPath, vaultPath, addRecentFile]);

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
				const base =
					currentIndex >= 0 ? currentIndex : event.shiftKey ? 0 : -1;
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
		reorderTabs,
		recentFiles,
		canvasLoadingMessage,
	};
}
