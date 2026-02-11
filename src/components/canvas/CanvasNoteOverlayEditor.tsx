import { motion } from "motion/react";
import { memo, useMemo } from "react";
import { ChevronRight, RotateCcw, Save, X } from "../Icons";
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

	const statusMeta = (() => {
		if (!session) return null;
		if (session.phase === "loading") {
			return {
				title: "Loading",
				icon: <RotateCcw size={12} className="canvasStatusIconSpin" />,
				className: "canvasNoteEditorStatusMutating",
			};
		}
		if (session.phase === "saving") {
			return {
				title: "Saving",
				icon: <RotateCcw size={12} className="canvasStatusIconSpin" />,
				className: "canvasNoteEditorStatusMutating",
			};
		}
		if (session.phase === "conflict") {
			return {
				title: "Conflict",
				icon: <X size={12} />,
				className: "canvasNoteEditorStatusError",
			};
		}
		if (session.phase === "error") {
			return {
				title: "Save failed",
				icon: <X size={12} />,
				className: "canvasNoteEditorStatusError",
			};
		}
		if (session.dirty) {
			return {
				title: "Unsaved changes",
				icon: <span className="canvasStatusDot" aria-hidden="true" />,
				className: "canvasNoteEditorStatusDirty",
			};
		}
		return {
			title: "Saved",
			icon: <Save size={12} />,
			className: "canvasNoteEditorStatusSaved",
		};
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
					<ChevronRight size={14} className="canvasNotePageBackIcon" />
					<span>Back</span>
				</button>
				<div className="canvasNotePageTitleWrap">
					<div className="canvasNotePageTitle" title={title}>
						{title}
					</div>
					{statusMeta ? (
						<div
							className={`canvasNoteEditorStatus ${statusMeta.className}`}
							title={session?.errorMessage || statusMeta.title}
							aria-label={statusMeta.title}
						>
							{statusMeta.icon}
						</div>
					) : null}
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
