import { type UIMessage, useChat } from "@ai-sdk/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { TauriChatTransport } from "../../lib/ai/tauriChatTransport";
import { openSettingsWindow } from "../../lib/windows";
import { cn } from "../../utils/cn";
import { Settings as SettingsIcon, Sparkles, X } from "../Icons";
import { Button } from "../ui/shadcn/button";
import styles from "./ChatUI.module.css";
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
	query: string;
};

function parseAddTrigger(input: string): AddTrigger | null {
	const addMatch = input.match(/(?:^|\s)\/add\s*([\w\-./ ]*)$/);
	if (addMatch) {
		const idx = input.lastIndexOf("/add");
		return {
			start: idx,
			query: (addMatch[1] ?? "").trim(),
		};
	}
	const atMatch = input.match(/(?:^|\s)@([\w\-./ ]*)$/);
	if (atMatch) {
		const idx = input.lastIndexOf("@");
		return {
			start: idx,
			query: (atMatch[1] ?? "").trim(),
		};
	}
	return null;
}

export function AISidebar({
	isOpen,
	width,
	isResizing,
	onClose,
	onOpenSettings,
	activeFolderPath,
	activeCanvasId,
	onNewAICanvas,
	onAddAttachmentsToCanvas,
	onCreateNoteFromLastAssistant,
}: {
	isOpen: boolean;
	width: number;
	isResizing: boolean;
	onClose: () => void;
	onOpenSettings: () => void;
	activeFolderPath: string | null;
	activeCanvasId: string | null;
	onNewAICanvas: () => Promise<void>;
	onAddAttachmentsToCanvas: (paths: string[]) => Promise<void>;
	onCreateNoteFromLastAssistant: (markdown: string) => Promise<void>;
}) {
	const transport = useMemo(() => new TauriChatTransport(), []);
	const chat = useChat({ transport, experimental_throttle: 32 });
	const [input, setInput] = useState("");
	const [addPanelOpen, setAddPanelOpen] = useState(false);
	const [addPanelQuery, setAddPanelQuery] = useState("");

	const profiles = useAiProfiles();
	const context = useAiContext({ activeFolderPath });
	const shouldReduceMotion = useReducedMotion();
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
	const lastAssistantText = [...chat.messages]
		.reverse()
		.find((message) => message.role === "assistant");

	const handleSend = async () => {
		if (!canSend) return;
		const text = context.resolveMentionsFromInput(input);
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
					canvas_id: activeCanvasId ?? undefined,
					audit: true,
				},
			},
		);
	};

	const handleAddContext = (kind: "folder" | "file", path: string) => {
		context.addContext(kind, path);
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
		<motion.aside
			className={cn("aiSidebar", isOpen && "open")}
			style={{
				width,
				marginRight: isOpen ? 0 : -width,
				pointerEvents: isOpen ? "auto" : "none",
			}}
			animate={{ x: isOpen ? 0 : width, opacity: isOpen ? 1 : 0 }}
			initial={false}
			transition={
				isResizing || shouldReduceMotion
					? { type: "tween", duration: 0 }
					: { type: "spring", stiffness: 180, damping: 22, mass: 0.8 }
			}
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
							aria-label="AI profile"
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
						className={cn(
							"aiSidebarKeyPill aiSidebarBadge",
							profiles.secretConfigured ? "ok" : "warn",
						)}
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

					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Settings"
						onClick={() => {
							onOpenSettings();
							void openSettingsWindow("ai");
						}}
						title="Settings"
					>
						<SettingsIcon size={14} />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Close"
						onClick={onClose}
						title="Close"
					>
						<X size={14} />
					</Button>
				</div>
			</div>

			{profiles.error ? (
				<div className="aiSidebarError aiSidebarAlert" role="alert">
					{profiles.error}
				</div>
			) : null}

			<div className="aiSidebarBody" data-window-drag-ignore>
				<div
					className={`${styles.chatThread} ${styles.scrollArea}`}
					role="log"
					aria-live="polite"
				>
					{chat.messages.length === 0 ? (
						<div className={styles.chatEmpty}>
							<div className={styles.chatEmptyTitle}>
								Hi, how can I help you today?
							</div>
							<div className={styles.chatEmptyMeta}>
								Type @ or /add to attach folders and files.
							</div>
						</div>
					) : null}
					{chat.messages.map((m) => {
						const text = messageText(m).trim();
						if (!text) return null;
						return (
							<div
								key={m.id}
								className={`${styles.message} ${
									m.role === "user"
										? styles.messageUser
										: styles.messageAssistant
								}`}
							>
								<div className={styles.messageContent}>{text}</div>
							</div>
						);
					})}
					{chat.status === "streaming" && (
						<div className={styles.typingIndicator}>
							<div className={styles.typingDot} />
							<div className={styles.typingDot} />
							<div className={styles.typingDot} />
						</div>
					)}
				</div>

				{chat.error ? (
					<div className={`${styles.error} ${styles.alert}`} role="alert">
						<span>{chat.error.message}</span>
						<button
							type="button"
							className={styles.errorDismiss}
							onClick={() => chat.clearError()}
						>
							Dismiss
						</button>
					</div>
				) : null}

				<div className={styles.contextBar}>
					<div className={styles.contextRow}>
						{context.attachedFolders.length ? (
							context.attachedFolders.map((item) => (
								<motion.button
									key={`${item.kind}:${item.path || "vault"}`}
									type="button"
									className={`${styles.contextChip} ${styles.badge}`}
									whileHover={shouldReduceMotion ? undefined : { y: -1 }}
									whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
									onClick={() => context.removeContext(item.kind, item.path)}
									title={`Remove ${item.kind}`}
								>
									<span className="mono">
										{item.kind === "folder" ? "Folder" : "File"}: {item.label}
									</span>
									<span aria-hidden>×</span>
								</motion.button>
							))
						) : (
							<div className={styles.contextEmpty}>
								No folders or files attached yet.
							</div>
						)}
					</div>
					<button
						type="button"
						className={`${styles.addContextBtn} ${styles.buttonMinTouch}`}
						onClick={() => {
							setAddPanelOpen(true);
							setAddPanelQuery("");
						}}
					>
						+ Add
					</button>
				</div>

				{showAddPanel ? (
					<div className={`${styles.addPanel} ${styles.accordionContent}`}>
						<input
							type="search"
							className={styles.addPanelSearch}
							placeholder="Search folders or files..."
							value={panelQuery}
							onChange={(e) => {
								if (!addPanelOpen) setAddPanelOpen(true);
								setAddPanelQuery(e.target.value);
							}}
						/>
						<div className={styles.addPanelMeta}>
							Type @ or /add in the input to add faster.
						</div>
						{context.folderIndexError ? (
							<div className={`${styles.error} ${styles.alert}`} role="alert">
								{context.folderIndexError}
							</div>
						) : null}
						<div className={styles.addPanelList}>
							{context.visibleSuggestions.length ? (
								context.visibleSuggestions.map((item) => (
									<motion.button
										key={`${item.kind}:${item.path || "vault"}`}
										type="button"
										className={styles.addPanelItem}
										whileHover={shouldReduceMotion ? undefined : { x: 4 }}
										whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
										onClick={() => handleAddContext(item.kind, item.path)}
									>
										<span className={styles.addPanelName}>
											{item.kind === "folder" ? "Folder" : "File"}: {item.label}
										</span>
									</motion.button>
								))
							) : (
								<div className={styles.addPanelEmpty}>
									No folders or files found.
								</div>
							)}
						</div>
						<div className={styles.addPanelActions}>
							<button
								type="button"
								className={`${styles.button} ${styles.buttonMinTouch}`}
								onClick={() => setAddPanelOpen(false)}
							>
								Close
							</button>
						</div>
					</div>
				) : null}

				<div className={styles.inputWrapper}>
					<div className={styles.composerActions}>
						<button
							type="button"
							className={styles.composerActionBtn}
							onClick={() => void onNewAICanvas()}
						>
							New AI Canvas
						</button>
						<button
							type="button"
							className={styles.composerActionBtn}
							onClick={() =>
								void context
									.resolveAttachedPathsForCanvas()
									.then((paths) => onAddAttachmentsToCanvas(paths))
							}
							disabled={context.attachedFolders.length === 0}
						>
							Add Attachments to Canvas
						</button>
						<button
							type="button"
							className={styles.composerActionBtn}
							onClick={() =>
								void onCreateNoteFromLastAssistant(
									lastAssistantText ? messageText(lastAssistantText) : "",
								)
							}
							disabled={!lastAssistantText}
						>
							Create Note from Last Reply
						</button>
					</div>
					<textarea
						className={`${styles.input} ${styles.textarea}`}
						value={input}
						placeholder="Ask your agent…"
						aria-label="AI sidebar chat input"
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
					<div className={styles.actionsBar}>
						<div className={styles.actionsLeft} />
						<div className={styles.actionsRight}>
							{chat.status === "streaming" ? (
								<button
									type="button"
									className={`${styles.button} ${styles.buttonDanger} ${styles.buttonMinTouch}`}
									onClick={() => chat.stop()}
								>
									Stop
								</button>
							) : (
								<button
									type="button"
									className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonMinTouch}`}
									disabled={!canSend}
									onClick={handleSend}
								>
									Send
								</button>
							)}
						</div>
					</div>
				</div>
			</div>
		</motion.aside>
	);
}
