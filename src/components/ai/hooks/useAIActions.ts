import { useCallback, useMemo, useState } from "react";
import { unifiedDiff } from "../../../lib/diff";
import { type NoteMeta, invoke } from "../../../lib/tauri";
import type { ContextManifest, StagedRewrite } from "../types";
import { errMessage } from "../utils";

export interface UseAIActionsOptions {
	activeNoteId: string | null;
	activeNoteDisk: { id: string; title: string; markdown: string } | null;
	includeActiveNote: boolean;
	payloadApproved: boolean;
	payloadManifest: ContextManifest | null;
	lastAssistantMessage: string;
	lastCompletedJobId: string | null;
	pendingActionRef: React.MutableRefObject<"chat" | "rewrite_active_note">;
	startRequest: (userText: string) => Promise<void>;
	onApplyToActiveNote: (markdown: string) => Promise<void>;
	onCreateNoteFromMarkdown: (
		title: string,
		markdown: string,
	) => Promise<NoteMeta | null>;
	onAddCanvasNoteNode: (noteId: string, title: string) => void;
	onAddCanvasTextNode: (text: string) => void;
}

export interface UseAIActionsResult {
	actionError: string;
	stagedRewrite: StagedRewrite | null;
	stagedRewriteDiff: string;
	setStagedRewrite: React.Dispatch<React.SetStateAction<StagedRewrite | null>>;
	onRewriteActiveNote: () => Promise<void>;
	stageRewriteFromLastAssistant: () => void;
	applyStagedRewrite: () => Promise<void>;
	rejectStagedRewrite: () => Promise<void>;
	onCreateNoteFromLastAssistant: () => Promise<void>;
	onCreateCardFromLastAssistant: () => Promise<void>;
}

export function useAIActions(options: UseAIActionsOptions): UseAIActionsResult {
	const {
		activeNoteId,
		activeNoteDisk,
		includeActiveNote,
		payloadApproved,
		payloadManifest,
		lastAssistantMessage,
		lastCompletedJobId,
		pendingActionRef,
		startRequest,
		onApplyToActiveNote,
		onCreateNoteFromMarkdown,
		onAddCanvasNoteNode,
		onAddCanvasTextNode,
	} = options;

	const [actionError, setActionError] = useState("");
	const [stagedRewrite, setStagedRewrite] = useState<StagedRewrite | null>(
		null,
	);

	const stagedRewriteDiff = useMemo(() => {
		if (!stagedRewrite || !activeNoteDisk?.markdown) return "";
		return unifiedDiff(
			activeNoteDisk.markdown,
			stagedRewrite.proposedMarkdown,
			{ contextLines: 3, maxDiffLines: 5000 },
		);
	}, [activeNoteDisk?.markdown, stagedRewrite]);

	const onRewriteActiveNote = useCallback(async () => {
		if (!activeNoteId) {
			setActionError("No active note to rewrite.");
			return;
		}
		if (!includeActiveNote) {
			setActionError(
				"Enable Active note in the payload spec, then build + approve.",
			);
			return;
		}
		if (!payloadApproved || !payloadManifest) {
			setActionError("Build + approve the payload before starting a rewrite.");
			return;
		}
		const instruction = window.prompt(
			"Rewrite instructions (AI will return full markdown):",
			"Improve clarity and structure, keep meaning, preserve any frontmatter keys.",
		);
		if (!instruction) return;
		pendingActionRef.current = "rewrite_active_note";
		const userText = [
			"Rewrite the active note as markdown.",
			`Instruction: ${instruction}`,
			"Return ONLY the full markdown (no code fences).",
		].join("\n");
		await startRequest(userText);
	}, [
		activeNoteId,
		includeActiveNote,
		payloadApproved,
		payloadManifest,
		pendingActionRef,
		startRequest,
	]);

	const stageRewriteFromLastAssistant = useCallback(() => {
		if (!activeNoteId) {
			setActionError("No active note selected.");
			return;
		}
		if (!lastAssistantMessage.trim()) {
			setActionError("No assistant message to stage.");
			return;
		}
		const jobId = lastCompletedJobId ?? "unknown";
		setStagedRewrite({ jobId, proposedMarkdown: lastAssistantMessage });
		setActionError("");
	}, [activeNoteId, lastAssistantMessage, lastCompletedJobId]);

	const applyStagedRewrite = useCallback(async () => {
		if (!activeNoteId) {
			setActionError("No active note selected.");
			return;
		}
		if (!stagedRewrite) {
			setActionError("No staged rewrite.");
			return;
		}
		if (!window.confirm("Apply staged rewrite to the active note?")) return;
		setActionError("");
		try {
			await onApplyToActiveNote(stagedRewrite.proposedMarkdown);
			if (stagedRewrite.jobId && stagedRewrite.jobId !== "unknown") {
				await invoke("ai_audit_mark", {
					job_id: stagedRewrite.jobId,
					outcome: "rewrite_applied",
				});
			}
			setStagedRewrite(null);
		} catch (e) {
			setActionError(errMessage(e));
		}
	}, [activeNoteId, onApplyToActiveNote, stagedRewrite]);

	const rejectStagedRewrite = useCallback(async () => {
		if (!stagedRewrite) return;
		setActionError("");
		try {
			if (stagedRewrite.jobId && stagedRewrite.jobId !== "unknown") {
				await invoke("ai_audit_mark", {
					job_id: stagedRewrite.jobId,
					outcome: "rewrite_rejected",
				});
			}
		} catch {
			// ignore
		} finally {
			setStagedRewrite(null);
		}
	}, [stagedRewrite]);

	const onCreateNoteFromLastAssistant = useCallback(async () => {
		if (!lastAssistantMessage.trim()) {
			setActionError("No assistant message to use.");
			return;
		}
		const title = window.prompt("New note title:", "AI Note");
		if (title == null) return;
		setActionError("");
		try {
			const meta = await onCreateNoteFromMarkdown(title, lastAssistantMessage);
			if (meta) {
				onAddCanvasNoteNode(meta.id, meta.title);
			}
			if (lastCompletedJobId) {
				await invoke("ai_audit_mark", {
					job_id: lastCompletedJobId,
					outcome: "created_note",
				});
			}
		} catch (e) {
			setActionError(errMessage(e));
		}
	}, [
		lastAssistantMessage,
		lastCompletedJobId,
		onAddCanvasNoteNode,
		onCreateNoteFromMarkdown,
	]);

	const onCreateCardFromLastAssistant = useCallback(async () => {
		if (!lastAssistantMessage.trim()) {
			setActionError("No assistant message to use.");
			return;
		}
		const max = 1200;
		const text =
			lastAssistantMessage.length > max
				? `${lastAssistantMessage.slice(0, max)}\n…(truncated)`
				: lastAssistantMessage;
		onAddCanvasTextNode(text);
		if (lastCompletedJobId) {
			try {
				await invoke("ai_audit_mark", {
					job_id: lastCompletedJobId,
					outcome: "created_card",
				});
			} catch {
				// ignore
			}
		}
	}, [lastAssistantMessage, lastCompletedJobId, onAddCanvasTextNode]);

	return {
		actionError,
		stagedRewrite,
		stagedRewriteDiff,
		setStagedRewrite,
		onRewriteActiveNote,
		stageRewriteFromLastAssistant,
		applyStagedRewrite,
		rejectStagedRewrite,
		onCreateNoteFromLastAssistant,
		onCreateCardFromLastAssistant,
	};
}
