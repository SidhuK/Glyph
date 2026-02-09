import { motion } from "motion/react";
import { memo, useMemo } from "react";
import { RotateCcw, Save } from "../Icons";
import { CanvasNoteInlineEditor } from "../editor";
import { Button } from "../ui/shadcn/button";
import { useCanvasNoteEdit } from "./contexts";
import { isNoteNode } from "./types";
import type { CanvasNode } from "./types";

const springTransition = {
	type: "spring" as const,
	stiffness: 280,
	damping: 28,
};

interface CanvasNoteOverlayEditorProps {
	nodes: CanvasNode[];
}

export const CanvasNoteOverlayEditor = memo(function CanvasNoteOverlayEditor({
	nodes,
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
		sessionNode && isNoteNode(sessionNode)
			? sessionNode.data.title
			: (session?.noteId ?? "Untitled");

	const statusLabel = (() => {
		if (!session) return "";
		if (session.phase === "loading") return "Loading...";
		if (session.phase === "saving") return "Saving...";
		if (session.phase === "conflict") return "Conflict";
		if (session.phase === "error") return "Save failed";
		if (session.dirty) return "Unsaved changes";
		return "Saved";
	})();

	return (
		<motion.section
			className="canvasNotePage"
			initial={{ opacity: 0.96, scale: 0.998 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0.98, scale: 0.998 }}
			transition={springTransition}
		>
			<div className="canvasNotePageHeader">
				<button
					type="button"
					className="canvasNotePageBackBtn"
					onClick={() => closeEditor()}
				>
					<span className="canvasNotePageBackGlyph">{"\u2190"}</span>
					<span>Back to canvas</span>
				</button>
				<div className="canvasNotePageTitleWrap">
					<div className="canvasNotePageTitle" title={title}>
						{title}
					</div>
					<div
						className="canvasNoteEditorStatus"
						title={session?.errorMessage ?? ""}
					>
						{statusLabel}
					</div>
				</div>
				<div className="canvasNoteEditorActions">
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						title={session?.dirty ? "Save" : "Saved"}
						disabled={
							!session?.dirty ||
							session?.phase === "loading" ||
							session?.phase === "saving"
						}
						onClick={() => saveNow()}
					>
						<Save size={14} />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						title="Reload from disk"
						onClick={() => reloadFromDisk()}
					>
						<RotateCcw size={14} />
					</Button>
				</div>
			</div>

			{session?.errorMessage ? (
				<div className="canvasNoteEditorError">
					<div className="canvasNoteEditorErrorText">
						{session.errorMessage}
					</div>
					<div className="canvasNoteEditorErrorActions">
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							title="Reload from disk"
							onClick={() => reloadFromDisk()}
						>
							<RotateCcw size={14} />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							title="Overwrite on-disk file"
							onClick={() => overwriteDisk()}
						>
							<Save size={14} />
						</Button>
					</div>
				</div>
			) : null}

			<div className="canvasNotePageBody">
				<div className="canvasNotePageSurface">
					{session ? (
						session.phase === "loading" ? (
							<div className="canvasNoteEditorLoading">Loading...</div>
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
			</div>
		</motion.section>
	);
});
