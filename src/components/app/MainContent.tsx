import { useCallback, useEffect, useMemo, useState } from "react";
import {
	useFileTreeContext,
	useUIContext,
	useVault,
	useViewContext,
} from "../../contexts";
import { isInAppPreviewable } from "../../utils/filePreview";
import { X } from "../Icons";
import { FilePreviewPane } from "../preview/FilePreviewPane";
import { MarkdownEditorPane } from "../preview/MarkdownEditorPane";
import { WelcomeScreen } from "./WelcomeScreen";

interface MainContentProps {
	fileTree: {
		openFile: (relPath: string) => Promise<void>;
		openNonMarkdownExternally: (relPath: string) => Promise<void>;
	};
}

export function MainContent({ fileTree }: MainContentProps) {
	const {
		info,
		vaultPath,
		lastVaultPath,
		recentVaults,
		settingsLoaded,
		onOpenVault,
		onOpenVaultAtPath,
		onContinueLastVault,
		onCreateVault,
	} = useVault();

	const { canvasLoadingMessage } = useViewContext();
	const { activeFilePath, setActiveFilePath } = useFileTreeContext();

	const {
		activePreviewPath,
		setActivePreviewPath,
		setOpenMarkdownTabs,
		setActiveMarkdownTabPath,
	} = useUIContext();
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
		const markdownTabs = openTabs.filter((path) =>
			path.toLowerCase().endsWith(".md"),
		);
		setOpenMarkdownTabs(markdownTabs);
		const activeMarkdown = activeTabPath?.toLowerCase().endsWith(".md")
			? activeTabPath
			: null;
		setActiveMarkdownTabPath(activeMarkdown);
	}, [activeTabPath, openTabs, setActiveMarkdownTabPath, setOpenMarkdownTabs]);

	const closeTab = useCallback((path: string) => {
		setOpenTabs((prev) => {
			const idx = prev.indexOf(path);
			if (idx === -1) return prev;
			const next = prev.filter((p) => p !== path);
			setActiveTabPath((current) => {
				if (current !== path) return current;
				const fallback = next[idx] ?? next[idx - 1] ?? null;
				return fallback;
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

	const viewerPath = activeTabPath;
	const fileName = useCallback((path: string) => {
		const parts = path.split("/").filter(Boolean);
		return parts[parts.length - 1] ?? path;
	}, []);

	const content = useMemo(() => {
		if (!viewerPath) return null;
		if (viewerPath.toLowerCase().endsWith(".md")) {
			return (
				<MarkdownEditorPane
					relPath={viewerPath}
					onDirtyChange={(dirty) =>
						setDirtyByPath((prev) =>
							prev[viewerPath] === dirty
								? prev
								: { ...prev, [viewerPath]: dirty },
						)
					}
				/>
			);
		}
		if (isInAppPreviewable(viewerPath)) {
			return (
				<FilePreviewPane
					relPath={viewerPath}
					onClose={() => closeTab(viewerPath)}
					onOpenExternally={(path) => fileTree.openNonMarkdownExternally(path)}
				/>
			);
		}
		if (canvasLoadingMessage) {
			return <div className="canvasEmpty">{canvasLoadingMessage}</div>;
		}
		return null;
	}, [canvasLoadingMessage, closeTab, fileTree, viewerPath]);

	if (!vaultPath) {
		if (!settingsLoaded) {
			return <main className="mainArea" />;
		}
		return (
			<main className="mainArea mainAreaWelcome">
				<WelcomeScreen
					appName={info?.name ?? null}
					lastVaultPath={lastVaultPath}
					recentVaults={recentVaults}
					onOpenVault={onOpenVault}
					onCreateVault={onCreateVault}
					onContinueLastVault={onContinueLastVault}
					onSelectRecentVault={onOpenVaultAtPath}
				/>
			</main>
		);
	}

	return (
		<main className="mainArea">
			<div className="canvasWrapper">
				<div className="canvasPaneHost">
					<div className="mainTabsBar">
						<div className="mainTabsSide" />
						<div className="mainTabsCenter">
							<div className="mainTabsStrip">
								{openTabs.map((path) => {
									const isActive = path === activeTabPath;
									const isDirty = Boolean(dirtyByPath[path]);
									return (
										<button
											key={path}
											type="button"
											className={`mainTab ${isActive ? "is-active" : ""}`}
											onClick={() => setActiveTabPath(path)}
											title={path}
											draggable
											onDragStart={() => setDragTabPath(path)}
											onDragEnd={() => setDragTabPath(null)}
											onDragOver={(event) => event.preventDefault()}
											onDrop={(event) => {
												event.preventDefault();
												if (dragTabPath) reorderTabs(dragTabPath, path);
												setDragTabPath(null);
											}}
										>
											{isDirty ? (
												<span className="mainTabDirty" aria-hidden />
											) : null}
											<span className="mainTabLabel">{fileName(path)}</span>
											<button
												type="button"
												className="mainTabClose"
												onClick={(event) => {
													event.stopPropagation();
													closeTab(path);
												}}
												aria-label={`Close ${fileName(path)}`}
											>
												<X size={12} />
											</button>
										</button>
									);
								})}
							</div>
						</div>
						<div className="mainTabsSide" />
					</div>
					{content}
				</div>
			</div>
		</main>
	);
}
