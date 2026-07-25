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
import { ACTIVITY_TIMELINE_TAB_ID } from "../../lib/activityTimeline";
import { ALL_DOCS_TAB_ID } from "../../lib/allDocs";
import type { DatabasesOpenRequest } from "../../lib/database/openDatabasesRequest";
import { DATABASES_TAB_ID } from "../../lib/databases";
import {
	ACTIVITY_DOCS_PAGE_SIZE,
	getPrefetchedAllDocs,
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
import { NotePane } from "../preview/NotePane";
import { CanvasPaneAwait } from "./CanvasPaneAwait";
import { TabBar } from "./TabBar";
import {
	loadActivityTimelinePane,
	loadAllDocsPane,
	loadDatabasesPane,
} from "./prefetchablePanes";
import type { WorkspaceEditorPane } from "./useTabManager";

const PinnedDocsPane = lazy(() =>
	import("./PinnedDocsPane").then((module) => ({
		default: module.PinnedDocsPane,
	})),
);
const DatabasesPane = lazy(loadDatabasesPane);
const AllDocsPane = lazy(loadAllDocsPane);
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
	onOpenFileInNewTab: (relPath: string) => Promise<void>;
	onOpenActivity: () => void;
	onPrefetchActivity: () => void;
	onOpenDatabase: (databaseId: string) => void;
	onStartRenamePath: (path: string) => void;
	onNavigateBreadcrumbPath: (dirPath: string) => void;
	onLoadBreadcrumbDir: (dirPath: string) => Promise<void>;
	onSelectTab: (tabId: string) => void;
	onCloseTab: (tabId: string) => void;
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
	onOpenFileInNewTab,
	onOpenActivity,
	onPrefetchActivity,
	onOpenDatabase,
	onStartRenamePath,
	onNavigateBreadcrumbPath,
	onLoadBreadcrumbDir,
	onSelectTab,
	onCloseTab,
	onReorderTabs,
	onOpenBlankTab,
	onGoBack,
	onGoForward,
	setDirtyByPath,
	onInfoSidebarOpenChange,
	databasesOpenRequest,
	onConsumeDatabasesOpenRequest,
}: EditorPaneCanvasProps) {
	const handlePrefetchTab = useCallback(
		(target: string | null) => {
			if (!target) return;
			if (isMarkdownPath(target)) {
				prefetchNote(target);
			} else if (target === ALL_DOCS_TAB_ID) {
				void loadAllDocsPane();
				void prefetchAllDocs(null);
			} else if (target === ACTIVITY_TIMELINE_TAB_ID) {
				void loadActivityTimelinePane();
				void prefetchAllDocs(null, ACTIVITY_DOCS_PAGE_SIZE);
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
			onOpenFileInNewTab={onOpenFileInNewTab}
			onOpenActivity={onOpenActivity}
			onPrefetchActivity={onPrefetchActivity}
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
			data-space-connections={
				viewerPath === SPACE_CONNECTIONS_TAB_ID ? "true" : undefined
			}
			data-all-docs={
				viewerPath === ALL_DOCS_TAB_ID ||
				viewerPath === ACTIVITY_TIMELINE_TAB_ID
					? "true"
					: undefined
			}
			data-databases={viewerPath === DATABASES_TAB_ID ? "true" : undefined}
		>
			{pane.tabs.length > 0 ? (
				<div className="mainTabBarTransition">
					<TabBar
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
						onStartRenamePath={onStartRenamePath}
						onReorder={onReorderTabs}
					/>
				</div>
			) : (
				<div
					aria-hidden="true"
					className="mainTabsEmptyDragRegion"
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
	onOpenFileInNewTab: EditorPaneCanvasProps["onOpenFileInNewTab"];
	onOpenActivity: EditorPaneCanvasProps["onOpenActivity"];
	onPrefetchActivity: EditorPaneCanvasProps["onPrefetchActivity"];
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
	onOpenFileInNewTab,
	onOpenActivity,
	onPrefetchActivity,
	onOpenDatabase,
	setDirtyByPath,
	onInfoSidebarOpenChange,
	databasesOpenRequest,
	onConsumeDatabasesOpenRequest,
}: EditorPaneContentProps) {
	const [gitDiff, setGitDiff] = useState<GitCommitDiff | null>(null);

	if (viewerPath === ALL_DOCS_TAB_ID) {
		return (
			<Suspense fallback={<CanvasPaneAwait variant="all-docs" />}>
				<AllDocsPane
					onOpenFile={onOpenFile}
					onOpenActivity={onOpenActivity}
					onPrefetchActivity={onPrefetchActivity}
					initialNotes={getPrefetchedAllDocs(null)}
				/>
			</Suspense>
		);
	}
	if (viewerPath === PINNED_DOCS_TAB_ID) {
		return (
			<Suspense fallback={<CanvasPaneAwait variant="all-docs" />}>
				<PinnedDocsPane
					onOpenFile={onOpenFile}
					onOpenDatabase={onOpenDatabase}
				/>
			</Suspense>
		);
	}
	if (viewerPath === ACTIVITY_TIMELINE_TAB_ID) {
		return (
			<Suspense fallback={<CanvasPaneAwait variant="all-docs" />}>
				<ActivityTimelinePane onOpenFile={onOpenFile} />
			</Suspense>
		);
	}
	if (viewerPath === DATABASES_TAB_ID) {
		const initialDatabaseId = databasesOpenRequest.databaseId;
		return (
			<Suspense fallback={<CanvasPaneAwait variant="databases" />}>
				<DatabasesPane
					onOpenFile={onOpenFile}
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
		<NotePane
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
