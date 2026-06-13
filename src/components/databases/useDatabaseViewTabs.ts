import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { DatabaseView, SaveDatabase } from "../../hooks/database/types";
import { createDefaultDatabaseView } from "../../lib/database/defaultView";
import { resolveSelectedViewId } from "../../lib/database/selectedViewStorage";
import { buildViewMenuItems } from "../../lib/database/viewMenuItems";
import type {
	DatabaseConfig,
	WorkspaceDatabaseDocument,
} from "../../lib/tauri";

export interface UseDatabaseViewTabsOptions {
	document: WorkspaceDatabaseDocument;
	selectedViewId: string;
	setSelectedViewId: (viewId: string | null) => void;
	saveDatabase: SaveDatabase;
	clearError: () => void;
	activeView: DatabaseView;
	patchActiveView: (viewPatch: Partial<DatabaseConfig["view"]>) => void;
	onBeginRenameFromMenu?: () => void;
}

export function useDatabaseViewTabs({
	document,
	selectedViewId,
	setSelectedViewId,
	saveDatabase,
	clearError,
	activeView,
	patchActiveView,
	onBeginRenameFromMenu,
}: UseDatabaseViewTabsOptions) {
	const [renamingViewId, setRenamingViewId] = useState<string | null>(null);
	const [viewNameDraft, setViewNameDraft] = useState("");
	const viewNameInputRef = useRef<HTMLInputElement | null>(null);

	const views = document.database.views;
	const viewCount = views.length;

	useEffect(() => {
		if (!renamingViewId) return;
		const frame = requestAnimationFrame(() => {
			viewNameInputRef.current?.focus({ preventScroll: true });
			viewNameInputRef.current?.select();
		});
		return () => cancelAnimationFrame(frame);
	}, [renamingViewId]);

	const startViewRename = useCallback(
		(viewId: string) => {
			const view = document.database.views.find((v) => v.id === viewId);
			if (!view) return;
			setViewNameDraft(view.name);
			setRenamingViewId(viewId);
		},
		[document],
	);

	const commitViewRename = useCallback(() => {
		if (!renamingViewId || !viewNameDraft.trim()) {
			setRenamingViewId(null);
			return;
		}
		const current = document.database.views.find(
			(v) => v.id === renamingViewId,
		);
		if (!current || viewNameDraft.trim() === current.name) {
			setRenamingViewId(null);
			return;
		}
		void saveDatabase({
			...document.database,
			views: document.database.views.map((v) =>
				v.id === renamingViewId ? { ...v, name: viewNameDraft.trim() } : v,
			),
		});
		setRenamingViewId(null);
	}, [document, renamingViewId, saveDatabase, viewNameDraft]);

	const handleDeleteView = useCallback(
		async (viewId: string) => {
			if (document.database.views.length <= 1) return;
			try {
				const saved = await saveDatabase({
					...document.database,
					views: document.database.views.filter((v) => v.id !== viewId),
				});
				if (selectedViewId === viewId) {
					setSelectedViewId(
						resolveSelectedViewId(saved.database.id, saved.database.views),
					);
				}
			} catch {
				// saveDatabase owns surfacing the error; avoid unhandled rejections.
			}
		},
		[document, saveDatabase, selectedViewId, setSelectedViewId],
	);

	const handleSelectViewLayout = useCallback(
		(layout: DatabaseConfig["view"]["layout"]) => {
			if (activeView.layout === layout) return;
			patchActiveView({ layout });
		},
		[activeView.layout, patchActiveView],
	);

	const handleRenameActiveView = useCallback(() => {
		startViewRename(activeView.id);
	}, [activeView.id, startViewRename]);

	const handleViewTabKeyDown = useCallback(
		(event: KeyboardEvent<HTMLButtonElement>, viewId: string) => {
			const index = views.findIndex((view) => view.id === viewId);
			if (index < 0) return;
			const tabList = event.currentTarget.closest('[role="tablist"]');
			const selectAndFocusView = (nextViewId: string) => {
				setSelectedViewId(nextViewId);
				window.requestAnimationFrame(() => {
					const tabs =
						tabList?.querySelectorAll<HTMLButtonElement>(".databasesViewTab") ??
						[];
					for (const tab of tabs) {
						if (tab.dataset.viewId === nextViewId) {
							tab.focus();
							break;
						}
					}
				});
			};

			if (event.key === "ArrowRight") {
				event.preventDefault();
				const next = views[index + 1] ?? views[0];
				selectAndFocusView(next.id);
				return;
			}
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				const prev = views[index - 1] ?? views[views.length - 1];
				selectAndFocusView(prev.id);
				return;
			}
			if (event.key === "Home") {
				event.preventDefault();
				selectAndFocusView(views[0].id);
				return;
			}
			if (event.key === "End") {
				event.preventDefault();
				selectAndFocusView(views[views.length - 1].id);
			}
		},
		[setSelectedViewId, views],
	);

	const handleDeleteActiveView = useCallback(() => {
		void handleDeleteView(activeView.id).catch(() => undefined);
	}, [activeView.id, handleDeleteView]);

	const handleCreateView = useCallback(async () => {
		const templateView = document.database.views[0];
		if (!templateView) return;
		const nextName = `View ${document.database.views.length + 1}`;
		const nextView = createDefaultDatabaseView(nextName, templateView);
		await saveDatabase({
			...document.database,
			views: [...document.database.views, nextView],
		});
		clearError();
		setSelectedViewId(nextView.id);
	}, [clearError, document, saveDatabase, setSelectedViewId]);

	const handleRenameFromMenu = useCallback(() => {
		onBeginRenameFromMenu?.();
		handleRenameActiveView();
	}, [handleRenameActiveView, onBeginRenameFromMenu]);

	const viewActionMenuItems = useMemo(
		() =>
			buildViewMenuItems(activeView.layout, viewCount, {
				onSelectLayout: handleSelectViewLayout,
				onRename: handleRenameFromMenu,
				onDelete: handleDeleteActiveView,
			}),
		[
			activeView.layout,
			handleDeleteActiveView,
			handleRenameFromMenu,
			handleSelectViewLayout,
			viewCount,
		],
	);

	return {
		views,
		activeView,
		renamingViewId,
		viewNameDraft,
		viewNameInputRef,
		setSelectedViewId,
		startViewRename,
		commitViewRename,
		setViewNameDraft,
		setRenamingViewId,
		handleViewTabKeyDown,
		handleCreateView,
		viewActionMenuItems,
	};
}
