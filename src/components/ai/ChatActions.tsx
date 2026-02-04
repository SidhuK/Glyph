import type { StagedRewrite } from "./types";

interface ChatActionsProps {
	streaming: boolean;
	activeNoteId: string | null;
	lastAssistantMessage: string;
	actionError: string;
	stagedRewrite: StagedRewrite | null;
	stagedRewriteDiff: string;
	onRewriteActiveNote: () => Promise<void>;
	stageRewriteFromLastAssistant: () => void;
	applyStagedRewrite: () => Promise<void>;
	rejectStagedRewrite: () => Promise<void>;
	onCreateNoteFromLastAssistant: () => Promise<void>;
	onCreateCardFromLastAssistant: () => Promise<void>;
}

export function ChatActions({
	streaming,
	activeNoteId,
	lastAssistantMessage,
	actionError,
	stagedRewrite,
	stagedRewriteDiff,
	onRewriteActiveNote,
	stageRewriteFromLastAssistant,
	applyStagedRewrite,
	rejectStagedRewrite,
	onCreateNoteFromLastAssistant,
	onCreateCardFromLastAssistant,
}: ChatActionsProps) {
	return (
		<div className="aiActions">
			<div className="aiRow">
				<button
					type="button"
					onClick={onRewriteActiveNote}
					disabled={streaming || !activeNoteId}
				>
					Rewrite active note
				</button>
				<button
					type="button"
					onClick={stageRewriteFromLastAssistant}
					disabled={streaming || !activeNoteId || !lastAssistantMessage.trim()}
				>
					Stage rewrite
				</button>
				<button
					type="button"
					onClick={onCreateNoteFromLastAssistant}
					disabled={streaming || !lastAssistantMessage.trim()}
				>
					Create note
				</button>
				<button
					type="button"
					onClick={onCreateCardFromLastAssistant}
					disabled={streaming || !lastAssistantMessage.trim()}
				>
					Create card
				</button>
			</div>
			{actionError ? <div className="aiError">{actionError}</div> : null}
			{stagedRewrite ? (
				<div>
					<div className="aiRow">
						<button
							type="button"
							onClick={applyStagedRewrite}
							disabled={streaming}
						>
							Apply staged rewrite
						</button>
						<button
							type="button"
							onClick={rejectStagedRewrite}
							disabled={streaming}
						>
							Reject
						</button>
						<div className="aiMeta">Job: {stagedRewrite.jobId}</div>
					</div>
					<pre className="aiDiff mono">{stagedRewriteDiff}</pre>
				</div>
			) : null}
			{lastAssistantMessage.trim() ? (
				<details>
					<summary>Last assistant preview</summary>
					<textarea
						className="aiContextPreview mono"
						readOnly
						value={lastAssistantMessage}
					/>
				</details>
			) : null}
		</div>
	);
}
