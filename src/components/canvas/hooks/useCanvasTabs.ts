import { useCallback } from "react";
import type { CanvasNode, CanvasNoteEditSession, NoteTab } from "../types";

interface UseCanvasTabsProps {
	noteTabs: NoteTab[];
	activeTabId: string | null;
	noteEditSession: CanvasNoteEditSession | null;
	nodes: CanvasNode[];
	setNoteTabs: React.Dispatch<React.SetStateAction<NoteTab[]>>;
	setActiveTabId: (tabId: string | null) => void;
	closeInlineEditor: () => Promise<void>;
	beginInlineEdit: (node: CanvasNode) => Promise<boolean>;
}

export function useCanvasTabs({
	noteTabs,
	activeTabId,
	noteEditSession,
	nodes,
	setNoteTabs,
	setActiveTabId,
	closeInlineEditor,
	beginInlineEdit,
}: UseCanvasTabsProps) {
	const handleCloseTab = useCallback(
		(tabId: string) => {
			const tab = noteTabs.find((t) => t.tabId === tabId);
			if (tab?.noteId === noteEditSession?.noteId) {
				void closeInlineEditor();
			}
			setNoteTabs((prev) => prev.filter((t) => t.tabId !== tabId));
			if (activeTabId === tabId) {
				const remaining = noteTabs.filter((t) => t.tabId !== tabId);
				setActiveTabId(remaining.length ? remaining[0].tabId : null);
			}
		},
		[
			noteTabs,
			noteEditSession,
			closeInlineEditor,
			setNoteTabs,
			activeTabId,
			setActiveTabId,
		],
	);

	const handleSelectTab = useCallback(
		(tabId: string) => {
			setActiveTabId(tabId);
			const tab = noteTabs.find((t) => t.tabId === tabId);
			if (tab?.noteId) {
				const node = nodes.find(
					(n) =>
						n.type === "note" &&
						(n.data as Record<string, unknown>)?.noteId === tab.noteId,
				);
				if (node) void beginInlineEdit(node);
			}
		},
		[setActiveTabId, noteTabs, nodes, beginInlineEdit],
	);

	return { handleCloseTab, handleSelectTab };
}
