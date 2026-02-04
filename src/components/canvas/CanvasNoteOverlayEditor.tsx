import { AnimatePresence, motion } from "motion/react";
import { memo, useMemo } from "react";
import { CanvasNoteInlineEditor } from "../CanvasNoteInlineEditor";
import { RotateCcw, Save, X } from "../Icons";
import { useCanvasNoteEdit } from "./contexts";
import type { CanvasNode, NoteTab } from "./types";

interface CanvasNoteOverlayEditorProps {
	nodes: CanvasNode[];
	tabs: NoteTab[];
	activeTabId: string | null;
	onSelectTab: (tabId: string) => void;
	onCloseTab: (tabId: string) => void;
	onNewTab: () => void;
}

export const CanvasNoteOverlayEditor = memo(function CanvasNoteOverlayEditor({
	nodes,
	tabs,
	activeTabId,
	onSelectTab,
	onCloseTab,
	onNewTab,
}: CanvasNoteOverlayEditorProps) {
	const {
		session,
		closeEditor,
		saveNow,
		reloadFromDisk,
		overwriteDisk,
		setEditorMode,
		updateMarkdown,
	} = useCanvasNoteEdit();

	const sessionNode = useMemo(
		() => nodes.find((node) => node.id === session?.nodeId),
		[nodes, session?.nodeId],
	);
	const title =
		typeof (sessionNode?.data as Record<string, unknown> | null)?.title ===
		"string"
			? ((sessionNode?.data as Record<string, unknown>).title as string)
			: (session?.noteId ?? "Untitled");

	const statusLabel = (() => {
		if (!session) return "";
		if (session?.phase === "loading") return "Loading…";
		if (session?.phase === "saving") return "Saving…";
		if (session.phase === "conflict") return "Conflict";
		if (session.phase === "error") return "Save failed";
		if (session.dirty) return "Unsaved changes…";
		return "Saved";
	})();

	const showOverlay = Boolean(session || tabs.length);

	return (
		<AnimatePresence>
			{showOverlay ? (
				<motion.div
					className="canvasNoteEditorOverlay"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.18 }}
				>
					<motion.div
						className="canvasNoteEditorScrim"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.18 }}
						onClick={() => closeEditor()}
					/>
					<motion.div
						className="canvasNoteEditorPanel"
						initial={{ x: 24, opacity: 0, scale: 0.98 }}
						animate={{ x: 0, opacity: 1, scale: 1 }}
						exit={{ x: 24, opacity: 0, scale: 0.98 }}
						transition={{ type: "spring", stiffness: 420, damping: 32 }}
					>
						<div className="canvasNoteEditorTabs">
							<div className="canvasNoteEditorTabsScroll">
								{tabs.map((tab) => (
									<div
										key={tab.tabId}
										className={[
											"canvasNoteEditorTab",
											tab.tabId === activeTabId ? "active" : "",
										]
											.filter(Boolean)
											.join(" ")}
									>
										<button
											type="button"
											className="canvasNoteEditorTabButton"
											onClick={() => onSelectTab(tab.tabId)}
											title={tab.title}
										>
											{tab.title}
										</button>
										<button
											type="button"
											className="canvasNoteEditorTabClose"
											title="Close tab"
											onClick={() => onCloseTab(tab.tabId)}
										>
											×
										</button>
									</div>
								))}
							</div>
							<button
								type="button"
								className="canvasNoteEditorTabAdd"
								title="New tab"
								onClick={() => onNewTab()}
							>
								+
							</button>
						</div>

						<div className="canvasNoteEditorHeader">
							<div className="canvasNoteEditorTitle" title={title}>
								{title}
							</div>
							<div
								className="canvasNoteEditorStatus"
								title={session?.errorMessage ?? ""}
							>
								{statusLabel}
							</div>
							<div className="canvasNoteEditorActions">
								<button
									type="button"
									className="iconBtn sm"
									title={session?.dirty ? "Save" : "Saved"}
									disabled={
										!session?.dirty ||
										session?.phase === "loading" ||
										session?.phase === "saving"
									}
									onClick={() => saveNow()}
								>
									<Save size={14} />
								</button>
								<button
									type="button"
									className="iconBtn sm"
									title="Reload from disk"
									onClick={() => reloadFromDisk()}
								>
									<RotateCcw size={14} />
								</button>
								<button
									type="button"
									className="iconBtn sm"
									title="Close tab"
									onClick={() => {
										if (activeTabId) {
											onCloseTab(activeTabId);
										} else {
											closeEditor();
										}
									}}
								>
									<X size={14} />
								</button>
							</div>
						</div>

						{session?.errorMessage ? (
							<div className="canvasNoteEditorError">
								<div className="canvasNoteEditorErrorText">
									{session.errorMessage}
								</div>
								<div className="canvasNoteEditorErrorActions">
									<button
										type="button"
										className="iconBtn sm"
										title="Reload from disk"
										onClick={() => reloadFromDisk()}
									>
										<RotateCcw size={14} />
									</button>
									<button
										type="button"
										className="iconBtn sm"
										title="Overwrite on-disk file"
										onClick={() => overwriteDisk()}
									>
										<Save size={14} />
									</button>
								</div>
							</div>
						) : null}

						<div className="canvasNoteEditorBody">
							{session ? (
								session?.phase === "loading" ? (
									<div className="canvasNoteEditorLoading">Loading…</div>
								) : (
									<CanvasNoteInlineEditor
										markdown={session.markdown}
										mode={session.mode}
										onModeChange={setEditorMode}
										onChange={updateMarkdown}
									/>
								)
							) : (
								<div className="canvasNoteEditorEmpty">
									Open a Markdown note to start editing.
								</div>
							)}
						</div>
					</motion.div>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
});
