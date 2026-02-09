import { useEffect, useRef } from "react";
import { ChatActions } from "./ChatActions";
import { ChatInput } from "./ChatInput";
import { ChatMessages } from "./ChatMessages";
import { ContextPayload } from "./ContextPayload";
import { ProfileSettings } from "./ProfileSettings";
import { useAIActions } from "./hooks/useAIActions";
import { useAIChat } from "./hooks/useAIChat";
import { useAIContext } from "./hooks/useAIContext";
import { useAIProfiles } from "./hooks/useAIProfiles";
import type { AIPaneProps } from "./types";

export type { AIPaneProps, SelectedCanvasNode } from "./types";

export function AIPane({
	activeNoteId,
	activeNoteTitle,
	activeNoteMarkdown,
	selectedCanvasNodes,
	canvasDoc,
	onApplyToActiveNote,
	onCreateNoteFromMarkdown,
	onAddCanvasNoteNode,
	onAddCanvasTextNode,
}: AIPaneProps) {
	const profiles = useAIProfiles();
	const context = useAIContext({
		activeNoteId,
		activeNoteTitle,
		activeNoteMarkdown,
		selectedCanvasNodes,
		canvasDoc,
	});
	const chat = useAIChat({
		activeProfileId: profiles.activeProfileId,
		payloadApproved: context.payloadApproved,
		payloadManifest: context.payloadManifest,
		payloadPreview: context.payloadPreview,
	});
	const actions = useAIActions({
		activeNoteId,
		activeNoteDisk: context.activeNoteDisk,
		includeActiveNote: context.includeActiveNote,
		payloadApproved: context.payloadApproved,
		payloadManifest: context.payloadManifest,
		lastAssistantMessage: chat.lastAssistantMessage,
		lastCompletedJobId: chat.lastCompletedJobId,
		pendingActionRef: chat.pendingActionRef,
		startRequest: chat.startRequest,
		onApplyToActiveNote,
		onCreateNoteFromMarkdown,
		onAddCanvasNoteNode,
		onAddCanvasTextNode,
	});

	const pendingActionRef = chat.pendingActionRef;
	const streamingTextRef = chat.streamingTextRef;
	const setStagedRewrite = actions.setStagedRewrite;

	const streamingRef = useRef(chat.streaming);
	useEffect(() => {
		const wasStreaming = streamingRef.current;
		streamingRef.current = chat.streaming;
		if (
			wasStreaming &&
			!chat.streaming &&
			pendingActionRef.current === "rewrite_active_note"
		) {
			setStagedRewrite({
				jobId: chat.lastCompletedJobId ?? "unknown",
				proposedMarkdown: streamingTextRef.current,
			});
			pendingActionRef.current = "chat";
		}
	}, [
		chat.streaming,
		chat.lastCompletedJobId,
		pendingActionRef,
		streamingTextRef,
		setStagedRewrite,
	]);

	return (
		<div className="aiPane">
			<div className="aiHeader">
				<div className="aiTitle">AI</div>
				<div className="aiMeta">
					{profiles.activeProfile?.name ?? "No profile"}
				</div>
			</div>

			{profiles.profiles.length ? (
				<div className="aiRow">
					<label className="aiLabel" htmlFor="aiProfile">
						Profile
					</label>
					<select
						id="aiProfile"
						value={profiles.activeProfileId ?? ""}
						onChange={(e) =>
							profiles.setActiveProfileId(e.target.value || null)
						}
					>
						{profiles.profiles.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name}
							</option>
						))}
					</select>
				</div>
			) : (
				<div className="aiRow">
					<button type="button" onClick={profiles.createDefaultProfile}>
						Create profile
					</button>
				</div>
			)}

			{profiles.profileDraft ? (
				<ProfileSettings
					profileDraft={profiles.profileDraft}
					setProfileDraft={profiles.setProfileDraft}
					headersText={profiles.headersText}
					setHeadersText={profiles.setHeadersText}
					apiKeyDraft={profiles.apiKeyDraft}
					setApiKeyDraft={profiles.setApiKeyDraft}
					secretConfigured={profiles.secretConfigured}
					saveProfile={profiles.saveProfile}
					setApiKey={profiles.setApiKey}
					clearApiKey={profiles.clearApiKey}
				/>
			) : null}

			{profiles.settingsError ? (
				<div className="aiError">{profiles.settingsError}</div>
			) : null}

			<ContextPayload
				charBudget={context.charBudget}
				setCharBudget={context.setCharBudget}
				neighborDepth={context.neighborDepth}
				setNeighborDepth={context.setNeighborDepth}
				includeActiveNote={context.includeActiveNote}
				setIncludeActiveNote={context.setIncludeActiveNote}
				includeSelectedNodes={context.includeSelectedNodes}
				setIncludeSelectedNodes={context.setIncludeSelectedNodes}
				includeNoteContents={context.includeNoteContents}
				setIncludeNoteContents={context.setIncludeNoteContents}
				includeLinkPreviewText={context.includeLinkPreviewText}
				setIncludeLinkPreviewText={context.setIncludeLinkPreviewText}
				selectedNodesCount={selectedCanvasNodes.length}
				streaming={chat.streaming}
				payloadApproved={context.payloadApproved}
				setPayloadApproved={context.setPayloadApproved}
				payloadManifest={context.payloadManifest}
				payloadPreview={context.payloadPreview}
				payloadError={context.payloadError}
				buildPayload={context.buildPayload}
			/>

			<ChatActions
				streaming={chat.streaming}
				activeNoteId={activeNoteId}
				lastAssistantMessage={chat.lastAssistantMessage}
				actionError={actions.actionError}
				stagedRewrite={actions.stagedRewrite}
				stagedRewriteDiff={actions.stagedRewriteDiff}
				onRewriteActiveNote={actions.onRewriteActiveNote}
				stageRewriteFromLastAssistant={actions.stageRewriteFromLastAssistant}
				applyStagedRewrite={actions.applyStagedRewrite}
				rejectStagedRewrite={actions.rejectStagedRewrite}
				onCreateNoteFromLastAssistant={actions.onCreateNoteFromLastAssistant}
				onCreateCardFromLastAssistant={actions.onCreateCardFromLastAssistant}
			/>

			<div className="aiChat">
				<ChatMessages messages={chat.chatMessages} />
				<ChatInput
					input={chat.input}
					setInput={chat.setInput}
					streaming={chat.streaming}
					jobId={chat.jobId}
					chatError={chat.chatError}
					onSend={chat.onSend}
					onCancel={chat.onCancel}
					clearChat={chat.clearChat}
				/>
			</div>
		</div>
	);
}
