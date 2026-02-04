import { type UIMessage, useChat } from "@ai-sdk/react";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
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
	activeFolderPath,
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
	activeFolderPath: string | null;
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
		activeFolderPath,
		selectedCanvasNodes,
		canvasDoc,
	});

	const handleSend = async () => {
		if (!canSend) return;
		const text = input.trim();
		if (!text) return;
		setInput("");
		let payload = context.payloadPreview;
		let manifest = context.payloadManifest;
		if (!context.payloadApproved || !manifest) {
			const built = await context.ensurePayload();
			payload = built.payload;
			manifest = built.manifest;
		}
		if (context.payloadError) {
			setInput(text);
			return;
		}
		void chat.sendMessage(
			{ text },
			{
				body: {
					profile_id: profiles.activeProfileId,
					context: payload || undefined,
					context_manifest: manifest ?? undefined,
					audit: true,
				},
			},
		);
	};

	const canSend =
		chat.status !== "streaming" &&
		Boolean(input.trim()) &&
		Boolean(profiles.activeProfileId);

	const scopeLabel =
		context.scope === "vault"
			? "Vault"
			: context.scope === "manual"
				? "Manual"
				: context.scopeFolder
					? context.scopeFolder
					: "Active folder";
	const selectedFileCount =
		context.scope === "manual"
			? context.manualFiles.length
			: context.selectedFiles.length;
	const contextMeta = context.payloadManifest
		? `${context.payloadManifest.totalChars} chars · est ${context.payloadManifest.estTokens} tokens`
		: "Context not built yet";

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
						<div className="aiChatContextRibbon">
							<motion.button
								type="button"
								className="aiContextPill"
								onClick={() => setTab("context")}
								whileHover={{ y: -1 }}
								whileTap={{ scale: 0.98 }}
							>
								<span className="aiContextPillLabel">{scopeLabel}</span>
								<span className="aiContextPillMeta">
									{selectedFileCount} files
								</span>
							</motion.button>
							<div className="aiChatContextMeta">{contextMeta}</div>
							<div
								className={`aiChatContextStatus ${
									context.payloadBuilding
										? "building"
										: context.payloadApproved
											? "ready"
											: "pending"
								}`}
							>
								{context.payloadBuilding
									? "Building"
									: context.payloadApproved
										? "Ready"
										: "Needs review"}
							</div>
						</div>
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
										void handleSend();
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
										onClick={() => void handleSend()}
									>
										Send
									</button>
								)}
							</div>
						</div>
					</>
				) : (
					<div className="aiContextPane">
						<div className="aiContextHeader">
							<div>
								<div className="aiContextTitle">Context Studio</div>
								<div className="aiContextSubtitle">
									Auto-builds from your selected scope.
								</div>
							</div>
							<div className="aiContextHeaderActions">
								<button
									type="button"
									onClick={() => void context.buildPayload()}
									disabled={context.payloadBuilding}
								>
									Rebuild
								</button>
								<button
									type="button"
									disabled={!context.payloadPreview.trim()}
									onClick={() => context.setPayloadApproved(true)}
								>
									Approve
								</button>
								<div
									className={`aiContextApproved ${
										context.payloadApproved ? "ok" : ""
									}`}
								>
									{context.payloadApproved ? "Approved" : "Pending"}
								</div>
							</div>
						</div>

						<div className="aiContextGrid">
							<section className="aiContextCard">
								<div className="aiContextCardTitle">Notes + Canvas</div>
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
											context.setIncludeNoteContents(
												!context.includeNoteContents,
											)
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
							</section>

							<section className="aiContextCard aiContextCardFiles">
								<div className="aiContextCardTitle">Files</div>
								{context.scope === "folder" ? (
									<div className="aiContextFolderRow">
										<label>
											Folder path
											<input
												type="text"
												placeholder="Relative to vault root"
												value={context.scopeFolder}
												onChange={(e) => {
													context.setScopeFolder(e.target.value);
													context.setFollowActiveFolder(false);
												}}
											/>
										</label>
										<label className="aiContextToggle">
											<input
												type="checkbox"
												checked={context.followActiveFolder}
												onChange={() =>
													context.setFollowActiveFolder(
														!context.followActiveFolder,
													)
												}
											/>
											Follow active folder
										</label>
									</div>
								) : null}

								{context.scope === "manual" ? (
									<div className="aiContextManual">
										<div className="aiContextManualHeader">
											Select 3–4 files for a focused prompt.
										</div>
										<div className="aiContextChips">
											{context.manualFiles.length ? (
												context.manualFiles.map((path) => (
													<button
														type="button"
														key={path}
														className="aiContextChip"
														onClick={() => context.removeManualFile(path)}
													>
														<span className="mono">{path}</span>
														<span aria-hidden>×</span>
													</button>
												))
											) : (
												<div className="aiContextEmptyMeta">
													No files selected yet.
												</div>
											)}
										</div>
									</div>
								) : null}

								<div className="aiContextSearch">
									<input
										type="search"
										placeholder="Search file names..."
										value={context.contextSearch}
										onChange={(e) => context.setContextSearch(e.target.value)}
									/>
									<div className="aiContextSearchMeta">
										Showing {context.visibleFiles.length} of{" "}
										{context.filteredFiles.length} · Total{" "}
										{context.candidateTotal}
									</div>
								</div>

								{context.candidateError ? (
									<div className="aiSidebarError">{context.candidateError}</div>
								) : null}

								<div className="aiContextList">
									{context.visibleFiles.length ? (
										context.visibleFiles.map((file) => {
											const selected = context.selectedFiles.includes(
												file.path,
											);
											return (
												<motion.button
													key={file.path}
													type="button"
													className={`aiContextListItem ${
														selected ? "active" : ""
													}`}
													onClick={() => context.toggleSelectedFile(file.path)}
													whileHover={{ x: 4 }}
													whileTap={{ scale: 0.98 }}
												>
													<span className="aiContextListName">
														{file.name}
													</span>
													<span className="aiContextListPath mono">
														{file.path}
													</span>
												</motion.button>
											);
										})
									) : (
										<div className="aiContextEmptyMeta">
											No files found.
										</div>
									)}
								</div>
							</section>
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

						<div className="aiContextScopeBar">
							<motion.button
								type="button"
								className={context.scope === "folder" ? "active" : ""}
								onClick={() => context.setScope("folder")}
								whileHover={{ y: -1 }}
								whileTap={{ scale: 0.98 }}
							>
								Folder
							</motion.button>
							<motion.button
								type="button"
								className={context.scope === "vault" ? "active" : ""}
								onClick={() => context.setScope("vault")}
								whileHover={{ y: -1 }}
								whileTap={{ scale: 0.98 }}
							>
								Vault
							</motion.button>
							<motion.button
								type="button"
								className={context.scope === "manual" ? "active" : ""}
								onClick={() => context.setScope("manual")}
								whileHover={{ y: -1 }}
								whileTap={{ scale: 0.98 }}
							>
								Manual
							</motion.button>
						</div>
					</div>
				)}
			</div>
		</aside>
	);
}
