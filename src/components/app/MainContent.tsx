import { m } from "motion/react";
import {
	type CSSProperties,
	type Dispatch,
	type SetStateAction,
	Suspense,
	lazy,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import {
	useAISidebarContext,
	useSpace,
	useUILayoutContext,
} from "../../contexts";
import { useResizablePanel } from "../../hooks/useResizablePanel";
import { useShortcutBindings } from "../../hooks/useShortcutBindings";
import { APP_TAGLINE } from "../../lib/copy";
import {
	type DatabasesOpenRequest,
	INITIAL_DATABASES_OPEN_REQUEST,
} from "../../lib/database/openDatabasesRequest";
import { formatShortcutPartsForPlatform } from "../../lib/shortcuts/platform";
import type { SplitEditorNode } from "../../lib/splitEditor";
import type { FsEntry } from "../../lib/tauri";
import { toast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { AIFloatingHost } from "../ai/AIFloatingHost";
import { useAiPanelSession } from "../ai/aiPanelSession";
import type { CreateMarkdownFileOptions } from "../editor/types";
import { FolioWorkspace } from "../folio/FolioWorkspace";
import { NoteSidePeek } from "../preview/NoteSidePeek";
import { AboutSettingsPane } from "../settings/AboutSettingsPane";
import { AiSettingsPane } from "../settings/AiSettingsPane";
import { AppearanceSettingsPane } from "../settings/AppearanceSettingsPane";
import { EditorSettingsPane } from "../settings/EditorSettingsPane";
import { ExperimentalSettingsPane } from "../settings/ExperimentalSettingsPane";
import { GeneralSettingsPane } from "../settings/GeneralSettingsPane";
import { GitSettingsPane } from "../settings/GitSettingsPane";
import { SpaceSettingsPane } from "../settings/SpaceSettingsPane";
import type { SettingsTab } from "../settings/settingsConfig";
import { localizedSettingsTabLabel } from "../settings/settingsSearch";
import { EditorPaneCanvas } from "./EditorPaneCanvas";
import { SplitEditorLayout } from "./SplitEditorLayout";
import { WelcomeScreen } from "./WelcomeScreen";
import type {
	SplitEditorDragSource,
	SplitEditorDropTarget,
} from "./splitEditorDnd";
import type { WorkspaceEditorPane } from "./useTabManager";

const DAILY_NOTES_SETUP_TOAST_ID = "daily-notes-setup";
const ShortcutsSettingsPane = lazy(() =>
	import("../settings/ShortcutsSettingsPane").then((module) => ({
		default: module.ShortcutsSettingsPane,
	})),
);
const UsageSettingsPane = lazy(() =>
	import("../settings/usage/UsageSettingsPane").then((module) => ({
		default: module.UsageSettingsPane,
	})),
);

function EmptyStateCommandPaletteHint({
	onOpenCommandPalette,
}: {
	onOpenCommandPalette: () => void;
}) {
	const { t } = useTranslation();
	const { getBinding } = useShortcutBindings();
	const shortcut = getBinding("open-command-palette");
	const shortcutParts = shortcut
		? formatShortcutPartsForPlatform(shortcut)
		: [];

	return (
		<div className="mainEmptyBottomBlock">
			<p className="mainEmptyPrompt">
				{shortcutParts.length ? (
					<Trans
						i18nKey="emptyState.commandPalettePrompt"
						components={{
							shortcut: (
								<button
									type="button"
									className="mainEmptyShortcutInline"
									onClick={onOpenCommandPalette}
									title={t("commandPalette.title")}
									aria-label={t("emptyState.openCommandPalette")}
								>
									<kbd className="mainEmptyShortcutBadge">
										<span className="mainEmptyShortcutCombo">
											{shortcutParts.map((part) => (
												<span key={part} className="mainEmptyShortcutPart">
													{part}
												</span>
											))}
										</span>
									</kbd>
								</button>
							),
						}}
					/>
				) : (
					<button
						type="button"
						className="mainEmptyShortcutInline"
						onClick={onOpenCommandPalette}
						title={t("commandPalette.title")}
					>
						{t("emptyState.openCommandPalette")}
					</button>
				)}
			</p>
			<div className="mainEmptyTagline">{APP_TAGLINE}</div>
		</div>
	);
}

function SettingsTabContent({ tab }: { tab: SettingsTab }) {
	switch (tab) {
		case "general":
			return <GeneralSettingsPane />;
		case "appearance":
			return <AppearanceSettingsPane />;
		case "editor":
			return <EditorSettingsPane />;
		case "shortcuts":
			return (
				<Suspense fallback={null}>
					<ShortcutsSettingsPane />
				</Suspense>
			);
		case "ai":
			return <AiSettingsPane />;
		case "space":
			return <SpaceSettingsPane />;
		case "git":
			return <GitSettingsPane />;
		case "about":
			return <AboutSettingsPane />;
		case "usage":
			return (
				<Suspense fallback={null}>
					<UsageSettingsPane />
				</Suspense>
			);
		case "experimental":
			return <ExperimentalSettingsPane />;
		default: {
			const _exhaustive: never = tab;
			return _exhaustive;
		}
	}
}

interface MainContentProps {
	fileTree: {
		createMarkdownFileAtPath: (
			options: CreateMarkdownFileOptions,
		) => Promise<string | null>;
		openNonMarkdownExternally: (relPath: string) => Promise<void>;
		onRenameDir: (
			path: string,
			nextName: string,
			kind: "dir" | "file",
		) => Promise<string | null>;
		onDeletePath: (path: string, kind: "dir" | "file") => Promise<boolean>;
	};
	onOpenFile: (relPath: string) => Promise<void>;
	onBrowseFile: (relPath: string) => Promise<void>;
	onOpenFolioFile: (relPath: string) => Promise<void>;
	onOpenFileInNewTab: (relPath: string) => Promise<void>;
	onOpenFolioFileInNewTab: (relPath: string) => Promise<void>;
	onOpenCommandPalette: () => void;
	onOpenDatabase: (databaseId: string) => void;
	panes: Record<string, WorkspaceEditorPane>;
	splitLayout: SplitEditorNode;
	focusedPaneId: string;
	rootEntries: FsEntry[];
	childrenByDir: Record<string, FsEntry[] | undefined>;
	activeTabPath: string | null;
	setActiveTabId: (tabId: string | null) => void;
	setDirtyByPath: Dispatch<SetStateAction<Record<string, boolean>>>;
	closeTab: (tabId: string) => void;
	toggleTabPinned: (tabId: string) => void;
	reorderTabs: (fromTabId: string, toTabId: string) => void;
	openBlankTabInPane: (paneId: string) => void;
	openFileInPane: (path: string, paneId: string) => boolean;
	splitPaneWithFile: (
		paneId: string,
		edge: Exclude<SplitEditorDropTarget["edge"], "center">,
		path: string,
	) => void;
	moveTabToPane: (
		tabId: string,
		paneId: string,
		edge: SplitEditorDropTarget["edge"],
	) => void;
	focusPane: (paneId: string) => void;
	resizeSplit: (splitId: string, ratio: number) => void;
	onStartRenamePath: (path: string) => void;
	onNavigateBreadcrumbPath: (dirPath: string) => void;
	onLoadBreadcrumbDir: (dirPath: string) => Promise<void>;
	onGoBackInPane: (paneId: string) => void;
	onGoForwardInPane: (paneId: string) => void;
	databasesOpenRequest: DatabasesOpenRequest;
	onConsumeDatabasesOpenRequest?: () => void;
	dailyNoteSetupNoticeRequest: number;
	onOpenDailyNotesSettings: () => void;
	onRightSidebarOpenChange?: (open: boolean) => void;
	peekNotePath: string | null;
	onCloseNotePeek: () => void;
	onOpenPeekedNote: () => void;
}

export const MainContent = memo(function MainContent({
	fileTree,
	onOpenFile,
	onBrowseFile,
	onOpenFolioFile,
	onOpenFileInNewTab,
	onOpenFolioFileInNewTab,
	onOpenCommandPalette,
	onOpenDatabase,
	panes,
	splitLayout,
	focusedPaneId,
	rootEntries,
	childrenByDir,
	activeTabPath,
	setActiveTabId,
	setDirtyByPath,
	closeTab,
	toggleTabPinned,
	reorderTabs,
	openBlankTabInPane,
	openFileInPane,
	splitPaneWithFile,
	moveTabToPane,
	focusPane,
	resizeSplit,
	onStartRenamePath,
	onNavigateBreadcrumbPath,
	onLoadBreadcrumbDir,
	onGoBackInPane,
	onGoForwardInPane,
	databasesOpenRequest,
	onConsumeDatabasesOpenRequest,
	dailyNoteSetupNoticeRequest,
	onOpenDailyNotesSettings,
	onRightSidebarOpenChange,
	peekNotePath,
	onCloseNotePeek,
	onOpenPeekedNote,
}: MainContentProps) {
	const { spacePath, settingsLoaded, onOpenSpace } = useSpace();
	const { folioMode, settingsMode, settingsTab } = useUILayoutContext();
	const { aiEnabled, aiPanelOpen, setAiPanelOpen } = useAISidebarContext();
	const { keepMounted: aiPanelKeepMounted } = useAiPanelSession();
	const [infoSidebarWidth, setInfoSidebarWidth] = useState(340);
	const [infoSidebarOpen, setInfoSidebarOpen] = useState(false);
	const handledDailyNoteSetupNoticeRequestRef = useRef(0);

	const aiSidebarVisible = aiEnabled && aiPanelOpen && !infoSidebarOpen;
	const aiSidebarMounted = aiSidebarVisible || aiPanelKeepMounted;
	const rightSidebarOpen =
		Boolean(spacePath) &&
		!settingsMode &&
		(aiSidebarVisible || infoSidebarOpen);
	const infoSidebarResize = useResizablePanel({
		min: 260,
		max: 620,
		direction: "left",
		onResize: setInfoSidebarWidth,
		currentWidth: infoSidebarWidth,
	});
	const notesInfoSidebarHostStyle = useMemo<CSSProperties>(
		() =>
			({
				"--markdown-info-sidebar-width": `${infoSidebarWidth}px`,
			}) as CSSProperties,
		[infoSidebarWidth],
	);
	useEffect(() => {
		onRightSidebarOpenChange?.(rightSidebarOpen);
	}, [onRightSidebarOpenChange, rightSidebarOpen]);

	useEffect(
		() => () => {
			onRightSidebarOpenChange?.(false);
		},
		[onRightSidebarOpenChange],
	);

	useEffect(() => {
		if (
			dailyNoteSetupNoticeRequest === 0 ||
			dailyNoteSetupNoticeRequest ===
				handledDailyNoteSetupNoticeRequestRef.current
		) {
			return;
		}
		if (!spacePath) return;
		handledDailyNoteSetupNoticeRequestRef.current = dailyNoteSetupNoticeRequest;
		toast.info("Set a folder to use dated notes", {
			id: DAILY_NOTES_SETUP_TOAST_ID,
			description: "Glyph will create dated notes there.",
			duration: 7200,
			action: {
				label: "Open settings",
				onClick: () => {
					toast.dismiss(DAILY_NOTES_SETUP_TOAST_ID);
					onOpenDailyNotesSettings();
				},
			},
		});
	}, [dailyNoteSetupNoticeRequest, onOpenDailyNotesSettings, spacePath]);

	useEffect(() => {
		if (spacePath) return;
		toast.dismiss(DAILY_NOTES_SETUP_TOAST_ID);
	}, [spacePath]);

	const handleInfoSidebarResizePointerDown = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			if (!rightSidebarOpen) return;
			infoSidebarResize.handlePointerDown(event);
		},
		[infoSidebarResize, rightSidebarOpen],
	);

	const { i18n } = useTranslation();
	const settingsPanelTitle = localizedSettingsTabLabel(
		settingsTab,
		i18n.language,
	);
	const handleRenameFile = useCallback(
		(path: string, nextName: string) =>
			fileTree.onRenameDir(path, nextName, "file"),
		[fileTree.onRenameDir],
	);
	const handleSplitDrop = useCallback(
		(source: SplitEditorDragSource, target: SplitEditorDropTarget) => {
			if (source.kind === "tab") {
				moveTabToPane(source.tabId, target.paneId, target.edge);
				return;
			}
			if (target.edge === "center") {
				openFileInPane(source.path, target.paneId);
				return;
			}
			splitPaneWithFile(target.paneId, target.edge, source.path);
		},
		[moveTabToPane, openFileInPane, splitPaneWithFile],
	);

	const renderEditorPane = useCallback(
		(paneId: string, focused: boolean) => {
			const pane = panes[paneId];
			if (!pane) return null;
			const handlesDatabasesOpenRequest =
				databasesOpenRequest.paneId === paneId;
			const paneDatabasesOpenRequest = handlesDatabasesOpenRequest
				? databasesOpenRequest
				: INITIAL_DATABASES_OPEN_REQUEST;
			return (
				<EditorPaneCanvas
					key={paneId}
					pane={pane}
					focused={focused}
					allowWindowDrag={splitLayout.type === "pane"}
					rootEntries={rootEntries}
					childrenByDir={childrenByDir}
					emptyState={
						<EmptyStateCommandPaletteHint
							onOpenCommandPalette={onOpenCommandPalette}
						/>
					}
					createMarkdownFileAtPath={fileTree.createMarkdownFileAtPath}
					onRenameFile={handleRenameFile}
					onOpenFile={onOpenFile}
					onBrowseFile={onBrowseFile}
					onOpenFileInNewTab={onOpenFileInNewTab}
					onOpenDatabase={onOpenDatabase}
					onStartRenamePath={onStartRenamePath}
					onNavigateBreadcrumbPath={onNavigateBreadcrumbPath}
					onLoadBreadcrumbDir={onLoadBreadcrumbDir}
					onSelectTab={setActiveTabId}
					onCloseTab={closeTab}
					onToggleTabPinned={toggleTabPinned}
					onReorderTabs={reorderTabs}
					onOpenBlankTab={openBlankTabInPane}
					onGoBack={onGoBackInPane}
					onGoForward={onGoForwardInPane}
					setDirtyByPath={setDirtyByPath}
					onInfoSidebarOpenChange={setInfoSidebarOpen}
					databasesOpenRequest={paneDatabasesOpenRequest}
					onConsumeDatabasesOpenRequest={
						handlesDatabasesOpenRequest
							? onConsumeDatabasesOpenRequest
							: undefined
					}
				/>
			);
		},
		[
			childrenByDir,
			closeTab,
			toggleTabPinned,
			databasesOpenRequest,
			fileTree,
			handleRenameFile,
			onConsumeDatabasesOpenRequest,
			onLoadBreadcrumbDir,
			onNavigateBreadcrumbPath,
			onOpenDatabase,
			onOpenFile,
			onBrowseFile,
			onOpenFileInNewTab,
			onOpenCommandPalette,
			onGoBackInPane,
			onGoForwardInPane,
			onStartRenamePath,
			openBlankTabInPane,
			panes,
			reorderTabs,
			rootEntries,
			setActiveTabId,
			setDirtyByPath,
			splitLayout.type,
		],
	);
	const editorCanvas = (
		<SplitEditorLayout
			layout={splitLayout}
			focusedPaneId={focusedPaneId}
			onFocusPane={focusPane}
			onDrop={handleSplitDrop}
			onResizeSplit={resizeSplit}
			renderPane={renderEditorPane}
		/>
	);
	const rightSidebarSurface = (
		<>
			<div
				ref={infoSidebarResize.resizeRef}
				className={cn(
					"notesInfoSidebarResizeHandle",
					!rightSidebarOpen && "is-hidden",
				)}
				onPointerDown={handleInfoSidebarResizePointerDown}
				onPointerMove={infoSidebarResize.handlePointerMove}
				onPointerUp={infoSidebarResize.handlePointerUp}
				data-window-drag-ignore
			/>
			<div
				id="notes-info-sidebar-root"
				className="notesInfoSidebarHost"
				aria-live="polite"
				data-open={rightSidebarOpen ? "true" : undefined}
				style={notesInfoSidebarHostStyle}
			>
				{aiSidebarMounted ? (
					<AIFloatingHost
						hidden={!rightSidebarOpen || !aiSidebarVisible}
						onToggle={() => setAiPanelOpen((open) => !open)}
					/>
				) : null}
			</div>
		</>
	);

	if (settingsMode) {
		return (
			<>
				<main className="mainArea">
					<div className="settingsTabPanel">
						<header className="settingsPanelHeader">
							<div className="settingsPanelTitleRow">
								<h2 className="settingsPanelTitle">{settingsPanelTitle}</h2>
							</div>
						</header>
						<SettingsTabContent tab={settingsTab} />
					</div>
				</main>
				{aiPanelKeepMounted ? rightSidebarSurface : null}
			</>
		);
	}

	if (!spacePath) {
		if (!settingsLoaded) return <main className="mainArea" />;
		return (
			<m.main
				className="mainArea mainAreaWelcome"
				initial={{ opacity: 0, scale: 0.98 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{
					type: "spring",
					stiffness: 260,
					damping: 24,
					duration: 0.4,
				}}
			>
				<WelcomeScreen onOpenSpace={onOpenSpace} />
			</m.main>
		);
	}

	return (
		<>
			<main
				className="mainArea"
				data-right-sidebar-open={rightSidebarOpen ? "true" : undefined}
			>
				<div className="canvasWrapper">
					{folioMode ? (
						<FolioWorkspace
							activeTabPath={activeTabPath}
							onOpenFile={onOpenFolioFile}
							onOpenFileInNewTab={onOpenFolioFileInNewTab}
							onRenameFile={(path, nextName) =>
								fileTree.onRenameDir(path, nextName, "file")
							}
							onDeleteFile={(path) => fileTree.onDeletePath(path, "file")}
						>
							{editorCanvas}
						</FolioWorkspace>
					) : (
						editorCanvas
					)}
					{peekNotePath ? (
						<NoteSidePeek
							relPath={peekNotePath}
							onClose={onCloseNotePeek}
							onOpen={onOpenPeekedNote}
						/>
					) : null}
				</div>
			</main>
			{rightSidebarSurface}
		</>
	);
});
