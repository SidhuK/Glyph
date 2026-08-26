import {
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	Suspense,
	lazy,
	memo,
	useCallback,
	useState,
} from "react";
import { useUILayoutContext } from "../../contexts";
import { ACTIVITY_TIMELINE_TAB_ID } from "../../lib/activityTimeline";
import type { DatabasesOpenRequest } from "../../lib/database/openDatabasesRequest";
import { DATABASES_TAB_ID } from "../../lib/databases";
import {
	getPrefetchedDatabaseDocument,
	getPrefetchedNote,
	prefetchAllDocs,
	prefetchDatabasesLanding,
	prefetchNote,
} from "../../lib/navigationPrefetch";
import { PINNED_DOCS_TAB_ID } from "../../lib/pinnedDocs";
import { SPACE_CONNECTIONS_TAB_ID } from "../../lib/spaceConnections";
import type { FsEntry, GitCommitDiff } from "../../lib/tauri";
import { isMarkdownPath } from "../../utils/path";
import { onWindowDragMouseDown } from "../../utils/window";
import type {
	CreateMarkdownFileOptions,
	ExtractToNoteActions,
} from "../editor/types";
import { MarkdownEditorPane } from "../preview/MarkdownEditorPane";
import { CanvasPaneAwait } from "./CanvasPaneAwait";
import { TabBar } from "./TabBar";
import {
	loadActivityTimelinePane,
	loadDatabasesPane,
} from "./prefetchablePanes";
import type { WorkspaceEditorPane } from "./useTabManager";

const PinnedDocsPane = lazy(() =>
	import("./PinnedDocsPane").then((module) => ({
		default: module.PinnedDocsPane,
	})),
);
const DatabasesPane = lazy(loadDatabasesPane);
const ActivityTimelinePane = lazy(loadActivityTimelinePane);
const SpaceConnectionsView = lazy(() =>
	import("../connections/SpaceConnectionsView").then((module) => ({
		default: module.SpaceConnectionsView,
	})),
);

interface EditorPaneCanvasProps {
	pane: WorkspaceEditorPane;
	focused: boolean;
	allowWindowDrag: boolean;
	rootEntries: FsEntry[];
	childrenByDir: Record<string, FsEntry[] | undefined>;
	emptyState: ReactNode;
	createMarkdownFileAtPath: (
		options: CreateMarkdownFileOptions,
	) => Promise<string | null>;
	onRenameFile: (path: string, nextName: string) => Promise<string | null>;
	onOpenFile: (relPath: string) => Promise<void>;
	onBrowseFile: (relPath: string) => Promise<void>;
	onOpenFileInNewTab: (relPath: string) => Promise<void>;
	onOpenDatabase: (databaseId: string) => void;
	onStartRenamePath: (path: string) => void;
	onNavigateBreadcrumbPath: (dirPath: string) => void;
	onLoadBreadcrumbDir: (dirPath: string) => Promise<void>;
	onSelectTab: (tabId: string) => void;
	onCloseTab: (tabId: string) => void;
	onToggleTabPinned: (tabId: string) => void;
	onReorderTabs: (fromTabId: string, toTabId: string) => void;
	onOpenBlankTab: (paneId: string) => void;
	onGoBack: (paneId: string) => void;
	onGoForward: (paneId: string) => void;
	setDirtyByPath: Dispatch<SetStateAction<Record<string, boolean>>>;
	onInfoSidebarOpenChange: (open: boolean) => void;
	databasesOpenRequest: DatabasesOpenRequest;
	onConsumeDatabasesOpenRequest?: () => void;
}

export const EditorPaneCanvas = memo(function EditorPaneCanvas({
	pane,
	focused,
	allowWindowDrag,
	rootEntries,
	childrenByDir,
	emptyState,
	createMarkdownFileAtPath,
	onRenameFile,
	onOpenFile,
	onBrowseFile,
	onOpenFileInNewTab,
	onOpenDatabase,
	onStartRenamePath,
	onNavigateBreadcrumbPath,
	onLoadBreadcrumbDir,
	onSelectTab,
	onCloseTab,
	onToggleTabPinned,
	onReorderTabs,
	onOpenBlankTab,
	onGoBack,
	onGoForward,
	setDirtyByPath,
	onInfoSidebarOpenChange,
	databasesOpenRequest,
	onConsumeDatabasesOpenRequest,
}: EditorPaneCanvasProps) {
	const { zenMode } = useUILayoutContext();
	const handlePrefetchTab = useCallback(
		(target: string | null) => {
			if (!target) return;
			if (isMarkdownPath(target)) {
				prefetchNote(target);
			} else if (target === ACTIVITY_TIMELINE_TAB_ID) {
				void loadActivityTimelinePane();
				void prefetchAllDocs(null);
			} else if (target === DATABASES_TAB_ID) {
				void loadDatabasesPane();
				void prefetchDatabasesLanding(databasesOpenRequest.databaseId);
			}
		},
		[databasesOpenRequest.databaseId],
	);

	const viewerPath = pane.activeTabPath;
	const content = viewerPath ? (
		<EditorPaneContent
			key={pane.activeTabId}
			viewerPath={viewerPath}
			focused={focused}
			createMarkdownFileAtPath={createMarkdownFileAtPath}
			onRenameFile={onRenameFile}
			onOpenFile={onOpenFile}
			onBrowseFile={onBrowseFile}
			onOpenFileInNewTab={onOpenFileInNewTab}
			onOpenDatabase={onOpenDatabase}
			setDirtyByPath={setDirtyByPath}
			onInfoSidebarOpenChange={onInfoSidebarOpenChange}
			databasesOpenRequest={databasesOpenRequest}
			onConsumeDatabasesOpenRequest={onConsumeDatabasesOpenRequest}
		/>
	) : null;

	return (
		<div
			className="canvasPaneHost"
			data-editor-pane-id={pane.id}
			data-space-connections={
				viewerPath === SPACE_CONNECTIONS_TAB_ID ? "true" : undefined
			}
			data-all-docs={
				viewerPath === ACTIVITY_TIMELINE_TAB_ID ? "true" : undefined
			}
			data-databases={viewerPath === DATABASES_TAB_ID ? "true" : undefined}
		>
			{!zenMode && pane.tabs.length > 0 ? (
				<div className="mainTabBarTransition">
					<TabBar
						paneId={pane.id}
						tabs={pane.tabs}
						rootEntries={rootEntries}
						childrenByDir={childrenByDir}
						activeTabId={pane.activeTabId}
						activeTabPath={pane.activeTabPath}
						useWindowBackground={!content}
						allowWindowDrag={allowWindowDrag}
						canGoBack={pane.canGoBack}
						canGoForward={pane.canGoForward}
						onGoBack={() => onGoBack(pane.id)}
						onGoForward={() => onGoForward(pane.id)}
						onOpenBlankTab={() => onOpenBlankTab(pane.id)}
						onPrefetchTab={handlePrefetchTab}
						onNavigateBreadcrumbPath={onNavigateBreadcrumbPath}
						onLoadBreadcrumbDir={onLoadBreadcrumbDir}
						onOpenBreadcrumbFile={onOpenFile}
						onRenameFile={onRenameFile}
						onSelectTab={onSelectTab}
						onCloseTab={onCloseTab}
						onToggleTabPinned={onToggleTabPinned}
						onStartRenamePath={onStartRenamePath}
						onReorder={onReorderTabs}
					/>
				</div>
			) : (
				<div
					aria-hidden="true"
					className="mainTabsEmptyDragRegion"
					data-zen-mode={zenMode ? "true" : undefined}
					data-tauri-drag-region={allowWindowDrag ? "" : undefined}
					onMouseDown={allowWindowDrag ? onWindowDragMouseDown : undefined}
				/>
			)}
			{content ?? <div className="mainEmptyState">{emptyState}</div>}
		</div>
	);
});

interface EditorPaneContentProps {
	viewerPath: string;
	focused: boolean;
	createMarkdownFileAtPath: EditorPaneCanvasProps["createMarkdownFileAtPath"];
	onRenameFile: EditorPaneCanvasProps["onRenameFile"];
	onOpenFile: EditorPaneCanvasProps["onOpenFile"];
	onBrowseFile: EditorPaneCanvasProps["onBrowseFile"];
	onOpenFileInNewTab: EditorPaneCanvasProps["onOpenFileInNewTab"];
	onOpenDatabase: EditorPaneCanvasProps["onOpenDatabase"];
	setDirtyByPath: EditorPaneCanvasProps["setDirtyByPath"];
	onInfoSidebarOpenChange: EditorPaneCanvasProps["onInfoSidebarOpenChange"];
	databasesOpenRequest: DatabasesOpenRequest;
	onConsumeDatabasesOpenRequest?: () => void;
}

function EditorPaneContent({
	viewerPath,
	focused,
	createMarkdownFileAtPath,
	onRenameFile,
	onOpenFile,
	onBrowseFile,
	onOpenFileInNewTab,
	onOpenDatabase,
	setDirtyByPath,
	onInfoSidebarOpenChange,
	databasesOpenRequest,
	onConsumeDatabasesOpenRequest,
}: EditorPaneContentProps) {
	const [gitDiff, setGitDiff] = useState<GitCommitDiff | null>(null);

	if (viewerPath === PINNED_DOCS_TAB_ID) {
		return (
			<Suspense fallback={<CanvasPaneAwait variant="all-docs" />}>
				<PinnedDocsPane
					onOpenFile={onBrowseFile}
					onOpenDatabase={onOpenDatabase}
				/>
			</Suspense>
		);
	}
	if (viewerPath === ACTIVITY_TIMELINE_TAB_ID) {
		return (
			<Suspense fallback={<CanvasPaneAwait variant="all-docs" />}>
				<ActivityTimelinePane onOpenFile={onBrowseFile} />
			</Suspense>
		);
	}
	if (viewerPath === DATABASES_TAB_ID) {
		const initialDatabaseId = databasesOpenRequest.databaseId;
		return (
			<Suspense fallback={<CanvasPaneAwait variant="databases" />}>
				<DatabasesPane
					onOpenFile={onBrowseFile}
					onRenameNotePath={onRenameFile}
					databasesOpenRequest={databasesOpenRequest}
					onConsumeOpenRequest={onConsumeDatabasesOpenRequest}
					initialDocument={
						initialDatabaseId
							? getPrefetchedDatabaseDocument(initialDatabaseId)
							: null
					}
				/>
			</Suspense>
		);
	}
	if (viewerPath === SPACE_CONNECTIONS_TAB_ID) {
		return (
			<Suspense fallback={<CanvasPaneAwait variant="connections" />}>
				<SpaceConnectionsView />
			</Suspense>
		);
	}
	if (!isMarkdownPath(viewerPath)) return null;

	const extractToNoteActions = {
		createMarkdownFile: createMarkdownFileAtPath,
		openNote: onOpenFile,
		openNoteInNewTab: onOpenFileInNewTab,
	} satisfies ExtractToNoteActions;

	return (
		<MarkdownEditorPane
			relPath={viewerPath}
			initialDoc={getPrefetchedNote(viewerPath)}
			extractToNoteActions={extractToNoteActions}
			active={focused}
			onInfoSidebarOpenChange={focused ? onInfoSidebarOpenChange : undefined}
			gitDiff={gitDiff}
			onGitDiffChange={setGitDiff}
			onDirtyChange={(dirty) =>
				setDirtyByPath((previous) =>
					previous[viewerPath] === dirty
						? previous
						: { ...previous, [viewerPath]: dirty },
				)
			}
		/>
	);
}
