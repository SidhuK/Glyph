import { type UIMessage, useChat } from "@ai-sdk/react";
import { useMemo, useState } from "react";
import { TauriChatTransport } from "../../lib/ai/tauriChatTransport";
import { openSettingsWindow } from "../../lib/windows";
import type { CanvasDocLike } from "../CanvasPane";
import { Settings as SettingsIcon, Sparkles, X } from "../Icons";
import { MotionIconButton } from "../MotionUI";
import { useAiContext } from "./useAiContext";
import { useAiProfiles } from "./useAiProfiles";

function messageText(message: UIMessage): string {
	return message.parts
		.filter((p) => p.type === "text")
		.map((p) => p.text)
		.join("");
}

export function AISidebar({
	isOpen,
	width,
	onClose,
	onOpenSettings,
	activeNoteId,
	activeNoteTitle,
	activeNoteMarkdown,
	selectedCanvasNodes,
	canvasDoc,
}: {
	isOpen: boolean;
	width: number;
	onClose: () => void;
	onOpenSettings: () => void;
	activeNoteId: string | null;
	activeNoteTitle: string | null;
	activeNoteMarkdown?: string | null;
	selectedCanvasNodes: Array<{
		id: string;
		type: string | null;
		data: Record<string, unknown> | null;
	}>;
	canvasDoc: CanvasDocLike | null;
}) {
	const transport = useMemo(() => new TauriChatTransport(), []);
	const chat = useChat({ transport, experimental_throttle: 32 });
	const [tab, setTab] = useState<"chat" | "context">("chat");
	const [input, setInput] = useState("");

	const profiles = useAiProfiles();
	const context = useAiContext({
		activeNoteId,
		activeNoteTitle,
		activeNoteMarkdown,
		selectedCanvasNodes,
		canvasDoc,
	});

	const canSend =
		chat.status !== "streaming" &&
		Boolean(input.trim()) &&
		Boolean(profiles.activeProfileId) &&
		Boolean(context.payloadApproved) &&
		Boolean(context.payloadManifest);

	return (
		<aside
			className={`aiSidebar ${isOpen ? "open" : ""}`}
			style={{ width: isOpen ? width : 0 }}
			aria-hidden={!isOpen}
		>
			<div className="aiSidebarHeader" data-window-drag-ignore>
				<div className="aiSidebarTitle">
					<Sparkles size={14} />
					<span>AI</span>
				</div>

				<div className="aiSidebarHeaderRight">
					{profiles.profiles.length ? (
						<select
							className="aiSidebarProfileSelect"
							value={profiles.activeProfileId ?? ""}
							onChange={(e) => void profiles.setActive(e.target.value || null)}
							title="AI profile"
						>
							{profiles.profiles.map((p) => (
								<option key={p.id} value={p.id}>
									{p.name}
								</option>
							))}
						</select>
					) : (
						<div className="aiSidebarMeta">No profiles</div>
					)}

					<div
						className={`aiSidebarKeyPill ${
							profiles.secretConfigured ? "ok" : "warn"
						}`}
						title={
							profiles.secretConfigured == null
								? "Key status unknown"
								: profiles.secretConfigured
									? "API key configured"
									: "API key not set"
						}
					>
						{profiles.secretConfigured == null
							? "?"
							: profiles.secretConfigured
								? "Key"
								: "No key"}
					</div>

					<MotionIconButton
						type="button"
						size="sm"
						onClick={() => {
							onOpenSettings();
							void openSettingsWindow("ai");
						}}
						title="Settings"
					>
						<SettingsIcon size={14} />
					</MotionIconButton>
					<MotionIconButton
						type="button"
						size="sm"
						onClick={onClose}
						title="Close"
					>
						<X size={14} />
					</MotionIconButton>
				</div>
			</div>

			{profiles.error ? (
				<div className="aiSidebarError">{profiles.error}</div>
			) : null}

			<div className="aiSidebarTabs" data-window-drag-ignore>
				<div className="sidebarSectionToggle">
					<button
						type="button"
						className={tab === "chat" ? "segBtn active" : "segBtn"}
						onClick={() => setTab("chat")}
					>
						Chat
					</button>
					<button
						type="button"
						className={tab === "context" ? "segBtn active" : "segBtn"}
						onClick={() => setTab("context")}
					>
						Context
					</button>
				</div>
			</div>

			<div className="aiSidebarBody" data-window-drag-ignore>
				{tab === "chat" ? (
					<>
						<div className="aiChatThread">
							{chat.messages.length === 0 ? (
								<div className="aiChatEmpty">
									<div className="aiChatEmptyTitle">
										Hi, how can I help you today?
									</div>
									<div className="aiChatEmptyMeta">
										Build + approve context in the Context tab first.
									</div>
								</div>
							) : null}
							{chat.messages.map((m) => {
								const text = messageText(m).trim();
								if (!text) return null;
								return (
									<div
										key={m.id}
										className={`aiChatMsg ${
											m.role === "user"
												? "aiChatMsg-user"
												: "aiChatMsg-assistant"
										}`}
									>
										<div className="aiChatContent">{text}</div>
									</div>
								);
							})}
						</div>

						{chat.error ? (
							<div className="aiSidebarError">
								<div className="aiSidebarErrorRow">
									<span>{chat.error.message}</span>
									<button type="button" onClick={() => chat.clearError()}>
										Dismiss
									</button>
								</div>
							</div>
						) : null}

						<div className="aiChatComposer">
							<textarea
								className="aiChatInput"
								value={input}
								placeholder={
									context.payloadApproved
										? "How can I help?"
										: "Approve context first…"
								}
								disabled={chat.status === "streaming"}
								onChange={(e) => setInput(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
										e.preventDefault();
										if (!canSend) return;
										const text = input.trim();
										setInput("");
										void chat.sendMessage(
											{ text },
											{
												body: {
													profile_id: profiles.activeProfileId,
													context: context.payloadPreview || undefined,
													context_manifest:
														context.payloadManifest ?? undefined,
													audit: true,
												},
											},
										);
									}
								}}
								rows={2}
							/>
							<div className="aiChatComposerActions">
								{chat.status === "streaming" ? (
									<button type="button" onClick={() => chat.stop()}>
										Stop
									</button>
								) : (
									<button
										type="button"
										disabled={!canSend}
										onClick={() => {
											if (!canSend) return;
											const text = input.trim();
											setInput("");
											void chat.sendMessage(
												{ text },
												{
													body: {
														profile_id: profiles.activeProfileId,
														context: context.payloadPreview || undefined,
														context_manifest:
															context.payloadManifest ?? undefined,
														audit: true,
													},
												},
											);
										}}
									>
										Send
									</button>
								)}
							</div>
						</div>
					</>
				) : (
					<div className="aiContextPane">
						<div className="aiContextControls">
							<label className="aiContextToggle">
								<input
									type="checkbox"
									checked={context.includeActiveNote}
									onChange={() =>
										context.setIncludeActiveNote(!context.includeActiveNote)
									}
								/>
								Include active note
							</label>
							<label className="aiContextToggle">
								<input
									type="checkbox"
									checked={context.includeSelectedNodes}
									onChange={() =>
										context.setIncludeSelectedNodes(
											!context.includeSelectedNodes,
										)
									}
								/>
								Include selected nodes
							</label>
							<label className="aiContextToggle">
								<input
									type="checkbox"
									checked={context.includeNoteContents}
									onChange={() =>
										context.setIncludeNoteContents(!context.includeNoteContents)
									}
								/>
								Include note contents
							</label>
							<label className="aiContextToggle">
								<input
									type="checkbox"
									checked={context.includeLinkPreviewText}
									onChange={() =>
										context.setIncludeLinkPreviewText(
											!context.includeLinkPreviewText,
										)
									}
								/>
								Include link preview text
							</label>

							<div className="aiContextRow">
								<label>
									Neighbor depth
									<select
										value={context.neighborDepth}
										onChange={(e) =>
											context.setNeighborDepth(
												Number(e.target.value) as 0 | 1 | 2,
											)
										}
									>
										<option value={0}>0</option>
										<option value={1}>1</option>
										<option value={2}>2</option>
									</select>
								</label>
								<label>
									Char budget
									<input
										type="number"
										value={context.charBudget}
										min={200}
										max={200_000}
										onChange={(e) =>
											context.setCharBudget(Number(e.target.value))
										}
									/>
								</label>
							</div>

							<div className="aiContextActions">
								<button
									type="button"
									onClick={() => void context.buildPayload()}
								>
									Build context
								</button>
								<button
									type="button"
									disabled={!context.payloadPreview.trim()}
									onClick={() => context.setPayloadApproved(true)}
								>
									Approve
								</button>
								{context.payloadApproved ? (
									<div className="aiContextApproved">Approved</div>
								) : null}
							</div>
						</div>

						{context.payloadError ? (
							<div className="aiSidebarError">{context.payloadError}</div>
						) : null}

						{context.payloadManifest ? (
							<div className="aiContextMeta">
								<div>
									{context.payloadManifest.items.length} items ·{" "}
									{context.payloadManifest.totalChars} chars · est{" "}
									{context.payloadManifest.estTokens} tokens
								</div>
							</div>
						) : null}

						<textarea
							className="aiContextPreview mono"
							readOnly
							value={context.payloadPreview}
							placeholder="Context payload preview will appear here…"
						/>
					</div>
				)}
			</div>
		</aside>
	);
}
