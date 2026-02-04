import { type UIMessage, useChat } from "@ai-sdk/react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { TauriChatTransport } from "../../lib/ai/tauriChatTransport";
import { openSettingsWindow } from "../../lib/windows";
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

type AddTrigger = {
	start: number;
	end: number;
	query: string;
};

function parseAddTrigger(input: string): AddTrigger | null {
	const addMatch = input.match(/(?:^|\s)\/add\s*([\w\-./ ]*)$/);
	if (addMatch) {
		const idx = input.lastIndexOf("/add");
		return {
			start: idx,
			end: input.length,
			query: (addMatch[1] ?? "").trim(),
		};
	}
	const atMatch = input.match(/(?:^|\s)@([\w\-./ ]*)$/);
	if (atMatch) {
		const idx = input.lastIndexOf("@");
		return {
			start: idx,
			end: input.length,
			query: (atMatch[1] ?? "").trim(),
		};
	}
	return null;
}

export function AISidebar({
	isOpen,
	width,
	onClose,
	onOpenSettings,
	activeFolderPath,
}: {
	isOpen: boolean;
	width: number;
	onClose: () => void;
	onOpenSettings: () => void;
	activeFolderPath: string | null;
}) {
	const transport = useMemo(() => new TauriChatTransport(), []);
	const chat = useChat({ transport, experimental_throttle: 32 });
	const [input, setInput] = useState("");
	const [addPanelOpen, setAddPanelOpen] = useState(false);
	const [addPanelQuery, setAddPanelQuery] = useState("");

	const profiles = useAiProfiles();
	const context = useAiContext({ activeFolderPath });
	const setContextSearch = context.setContextSearch;
	const trigger = parseAddTrigger(input);
	const showAddPanel = addPanelOpen || Boolean(trigger);
	const panelQuery = addPanelOpen ? addPanelQuery : (trigger?.query ?? "");

	useEffect(() => {
		setContextSearch(panelQuery);
	}, [panelQuery, setContextSearch]);

	const canSend =
		chat.status !== "streaming" &&
		Boolean(input.trim()) &&
		Boolean(profiles.activeProfileId);

	const handleSend = async () => {
		if (!canSend) return;
		const text = input.trim();
		if (!text) return;
		setInput("");
		const built = await context.ensurePayload();
		if (context.payloadError) {
			setInput(text);
			return;
		}
		void chat.sendMessage(
			{ text },
			{
				body: {
					profile_id: profiles.activeProfileId,
					context: built.payload || undefined,
					context_manifest: built.manifest ?? undefined,
					audit: true,
				},
			},
		);
	};

	const handleAddFolder = (path: string) => {
		context.addFolder(path);
		if (trigger) {
			setInput((prev) => {
				const before = prev.slice(0, trigger.start).trimEnd();
				return before ? `${before} ` : "";
			});
		}
		setAddPanelOpen(false);
		setAddPanelQuery("");
	};

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

			<div className="aiSidebarBody" data-window-drag-ignore>
				<div className="aiChatThread">
					{chat.messages.length === 0 ? (
						<div className="aiChatEmpty">
							<div className="aiChatEmptyTitle">
								Hi, how can I help you today?
							</div>
							<div className="aiChatEmptyMeta">
								Type @ or /add to attach more folders.
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
									m.role === "user" ? "aiChatMsg-user" : "aiChatMsg-assistant"
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

				<div className="aiChatFolderBar">
					<div className="aiChatFolderRow">
						{context.attachedFolders.length ? (
							context.attachedFolders.map((folder) => (
								<motion.button
									key={folder.path || "vault"}
									type="button"
									className="aiFolderChip"
									whileHover={{ y: -1 }}
									whileTap={{ scale: 0.98 }}
									onClick={() => context.removeFolder(folder.path)}
									title="Remove folder"
								>
									<span className="mono">{folder.label}</span>
									<span aria-hidden>×</span>
								</motion.button>
							))
						) : (
							<div className="aiChatFolderEmpty">No folder attached yet.</div>
						)}
					</div>
					<button
						type="button"
						className="aiAddFolderBtn"
						onClick={() => {
							setAddPanelOpen(true);
							setAddPanelQuery("");
						}}
					>
						+ Add
					</button>
				</div>

				{showAddPanel ? (
					<div className="aiAddFolderPanel">
						<div className="aiAddFolderSearch">
							<input
								type="search"
								placeholder="Search folders..."
								value={panelQuery}
								onChange={(e) => {
									if (!addPanelOpen) setAddPanelOpen(true);
									setAddPanelQuery(e.target.value);
								}}
							/>
							<div className="aiAddFolderMeta">
								Type @ or /add in the input to add faster.
							</div>
						</div>
						{context.folderIndexError ? (
							<div className="aiSidebarError">{context.folderIndexError}</div>
						) : null}
						<div className="aiAddFolderList">
							{context.visibleFolders.length ? (
								context.visibleFolders.map((folder) => (
									<motion.button
										key={folder.path || "vault"}
										type="button"
										className="aiAddFolderItem"
										whileHover={{ x: 4 }}
										whileTap={{ scale: 0.98 }}
										onClick={() => handleAddFolder(folder.path)}
									>
										<span className="aiAddFolderName">{folder.label}</span>
									</motion.button>
								))
							) : (
								<div className="aiChatFolderEmpty">No folders found.</div>
							)}
						</div>
						<div className="aiAddFolderActions">
							<button type="button" onClick={() => setAddPanelOpen(false)}>
								Close
							</button>
						</div>
					</div>
				) : null}

				<div className="aiChatComposer">
					<textarea
						className="aiChatInput"
						value={input}
						placeholder="Ask your agent…"
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
							<button type="button" disabled={!canSend} onClick={handleSend}>
								Send
							</button>
						)}
					</div>
				</div>
			</div>
		</aside>
	);
}
