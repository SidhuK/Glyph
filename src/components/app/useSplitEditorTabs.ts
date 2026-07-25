import {
	type Dispatch,
	type RefObject,
	type SetStateAction,
	useCallback,
	useMemo,
} from "react";
import {
	type SplitDropEdge,
	type SplitEditorNode,
	paneIdsInLayout,
	removeEditorPane,
	splitEditorPane,
	updateSplitRatio,
} from "../../lib/splitEditor";
import { isMarkdownPath } from "../../utils/path";
import type {
	TabHistoryById,
	WorkspaceEditorPane,
	WorkspaceTab,
} from "./useTabManager";

interface UseSplitEditorTabsArgs {
	tabs: WorkspaceTab[];
	historyByTabId: TabHistoryById;
	splitLayout: SplitEditorNode;
	focusedPaneId: string;
	setSplitLayout: Dispatch<SetStateAction<SplitEditorNode>>;
	activeTabByPane: Record<string, string | null>;
	tabsRef: RefObject<WorkspaceTab[]>;
	activeTabByPaneRef: RefObject<Record<string, string | null>>;
	createTab: (
		kind: WorkspaceTab["kind"],
		target: string | null,
		paneId?: string,
	) => WorkspaceTab;
	commitTabsChange: (
		nextTabs: WorkspaceTab[],
		nextActiveTabId: string | null,
	) => void;
	setActiveTabId: (tabId: string | null) => void;
	clearHistoryForTab: (tabId: string) => void;
	pushNoteHistory: (tabId: string, path: string) => void;
	navigateTabHistory: (tabId: string, delta: -1 | 1) => void;
}

function createSplit(
	layout: SplitEditorNode,
	paneId: string,
	edge: SplitDropEdge,
) {
	const newPaneId = `editor-pane-${crypto.randomUUID()}`;
	const nextLayout = splitEditorPane(
		layout,
		paneId,
		newPaneId,
		`editor-split-${crypto.randomUUID()}`,
		edge,
	);
	return { newPaneId, nextLayout };
}

export function useSplitEditorTabs({
	tabs,
	historyByTabId,
	splitLayout,
	focusedPaneId,
	setSplitLayout,
	activeTabByPane,
	tabsRef,
	activeTabByPaneRef,
	createTab,
	commitTabsChange,
	setActiveTabId,
	clearHistoryForTab,
	pushNoteHistory,
	navigateTabHistory,
}: UseSplitEditorTabsArgs) {
	const openBlankTabInPane = useCallback(
		(paneId: string) => {
			const blankTab = createTab("blank", null, paneId);
			commitTabsChange([...tabsRef.current, blankTab], blankTab.id);
		},
		[commitTabsChange, createTab, tabsRef],
	);

	const openFileInPane = useCallback(
		(path: string, paneId: string) => {
			if (!isMarkdownPath(path)) return false;
			const existing = tabsRef.current.find(
				(tab) => tab.paneId === paneId && tab.target === path,
			);
			if (existing) {
				commitTabsChange(tabsRef.current, existing.id);
				return true;
			}

			const paneActiveId = activeTabByPaneRef.current[paneId] ?? null;
			const paneActive = tabsRef.current.find(
				(tab) => tab.id === paneActiveId && tab.paneId === paneId,
			);
			const tab =
				paneActive?.kind === "blank"
					? { ...paneActive, kind: "file" as const, target: path }
					: createTab("file", path, paneId);
			const nextTabs =
				paneActive?.kind === "blank"
					? tabsRef.current.map((candidate) =>
							candidate.id === tab.id ? tab : candidate,
						)
					: [...tabsRef.current, tab];
			if (paneActive?.kind === "blank") clearHistoryForTab(tab.id);
			pushNoteHistory(tab.id, path);
			commitTabsChange(nextTabs, tab.id);
			return true;
		},
		[
			activeTabByPaneRef,
			clearHistoryForTab,
			commitTabsChange,
			createTab,
			pushNoteHistory,
			tabsRef,
		],
	);

	const splitPaneWithTab = useCallback(
		(
			paneId: string,
			edge: SplitDropEdge,
			kind: WorkspaceTab["kind"],
			target: string | null,
		) => {
			const { newPaneId, nextLayout } = createSplit(splitLayout, paneId, edge);
			if (nextLayout === splitLayout) return;
			const tab = createTab(kind, target, newPaneId);
			setSplitLayout(nextLayout);
			if (kind === "file" && target) pushNoteHistory(tab.id, target);
			commitTabsChange([...tabsRef.current, tab], tab.id);
		},
		[
			commitTabsChange,
			createTab,
			pushNoteHistory,
			setSplitLayout,
			splitLayout,
			tabsRef,
		],
	);

	const splitPaneWithFile = useCallback(
		(paneId: string, edge: SplitDropEdge, path: string) => {
			if (isMarkdownPath(path)) splitPaneWithTab(paneId, edge, "file", path);
		},
		[splitPaneWithTab],
	);

	const splitPaneWithBlank = useCallback(
		(edge: SplitDropEdge) => {
			splitPaneWithTab(focusedPaneId, edge, "blank", null);
		},
		[focusedPaneId, splitPaneWithTab],
	);

	const moveTabToPane = useCallback(
		(tabId: string, targetPaneId: string, edge: SplitDropEdge | "center") => {
			const sourceTab = tabsRef.current.find((tab) => tab.id === tabId);
			if (!sourceTab) return;

			if (edge === "center") {
				if (sourceTab.paneId === targetPaneId) {
					setActiveTabId(tabId);
					return;
				}
				const existing = sourceTab.target
					? tabsRef.current.find(
							(tab) =>
								tab.paneId === targetPaneId &&
								tab.target === sourceTab.target &&
								tab.kind === sourceTab.kind,
						)
					: null;
				if (existing) {
					setActiveTabId(existing.id);
					return;
				}

				const nextTabs = tabsRef.current.map((tab) =>
					tab.id === tabId ? { ...tab, paneId: targetPaneId } : tab,
				);
				const sourcePaneIsEmpty = !nextTabs.some(
					(tab) => tab.paneId === sourceTab.paneId,
				);
				if (sourcePaneIsEmpty && paneIdsInLayout(splitLayout).length > 1) {
					const nextLayout = removeEditorPane(splitLayout, sourceTab.paneId);
					if (nextLayout) setSplitLayout(nextLayout);
				}
				commitTabsChange(nextTabs, tabId);
				return;
			}

			const { newPaneId, nextLayout } = createSplit(
				splitLayout,
				targetPaneId,
				edge,
			);
			if (nextLayout === splitLayout) return;
			const sourcePaneTabs = tabsRef.current.filter(
				(tab) => tab.paneId === sourceTab.paneId,
			);
			const movedTab = { ...sourceTab, paneId: newPaneId };
			let nextTabs = tabsRef.current.map((tab) =>
				tab.id === tabId ? movedTab : tab,
			);
			if (sourcePaneTabs.length === 1) {
				const blankTab = createTab("blank", null, sourceTab.paneId);
				nextTabs = [...nextTabs, blankTab];
			}
			setSplitLayout(nextLayout);
			commitTabsChange(nextTabs, movedTab.id);
		},
		[
			commitTabsChange,
			createTab,
			setActiveTabId,
			setSplitLayout,
			splitLayout,
			tabsRef,
		],
	);

	const resizeSplit = useCallback(
		(splitId: string, ratio: number) => {
			setSplitLayout((current) => updateSplitRatio(current, splitId, ratio));
		},
		[setSplitLayout],
	);

	const navigatePaneHistory = useCallback(
		(paneId: string, delta: -1 | 1) => {
			const tabId = activeTabByPaneRef.current[paneId];
			if (!tabId) return;
			navigateTabHistory(tabId, delta);
		},
		[activeTabByPaneRef, navigateTabHistory],
	);
	const goBackInPane = useCallback(
		(paneId: string) => navigatePaneHistory(paneId, -1),
		[navigatePaneHistory],
	);
	const goForwardInPane = useCallback(
		(paneId: string) => navigatePaneHistory(paneId, 1),
		[navigatePaneHistory],
	);

	const panes = useMemo<Record<string, WorkspaceEditorPane>>(() => {
		const tabsByPane = new Map<string, WorkspaceTab[]>();
		for (const tab of tabs) {
			const paneTabs = tabsByPane.get(tab.paneId);
			if (paneTabs) paneTabs.push(tab);
			else tabsByPane.set(tab.paneId, [tab]);
		}

		const result: Record<string, WorkspaceEditorPane> = {};
		for (const paneId of paneIdsInLayout(splitLayout)) {
			const paneTabs = tabsByPane.get(paneId) ?? [];
			const paneActiveTabId =
				activeTabByPane[paneId] ?? paneTabs[0]?.id ?? null;
			const paneActiveTab =
				paneTabs.find((tab) => tab.id === paneActiveTabId) ?? null;
			const history = paneActiveTabId
				? historyByTabId[paneActiveTabId]
				: undefined;
			result[paneId] = {
				id: paneId,
				tabs: paneTabs,
				activeTabId: paneActiveTabId,
				activeTabPath: paneActiveTab?.target ?? null,
				canGoBack: (history?.index ?? -1) > 0,
				canGoForward:
					(history?.index ?? -1) < (history?.entries.length ?? 0) - 1,
			};
		}
		return result;
	}, [activeTabByPane, historyByTabId, splitLayout, tabs]);

	return {
		panes,
		openBlankTabInPane,
		openFileInPane,
		splitPaneWithFile,
		splitPaneWithBlank,
		moveTabToPane,
		resizeSplit,
		goBackInPane,
		goForwardInPane,
	};
}
