import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type AiMessage,
	type AiProfile,
	TauriInvokeError,
	invoke,
} from "../lib/tauri";

type ChatMessage = AiMessage & { id: string };

export interface SelectedCanvasNode {
	id: string;
	type: string | null;
	data: Record<string, unknown> | null;
}

interface AIPaneProps {
	activeNoteId: string | null;
	activeNoteTitle: string | null;
	activeNoteMarkdown: string | null;
	selectedCanvasNodes: SelectedCanvasNode[];
	onApplyToActiveNote: (markdown: string) => Promise<void>;
	onCreateNoteFromMarkdown: (title: string, markdown: string) => Promise<void>;
}

function errMessage(err: unknown): string {
	if (err instanceof TauriInvokeError) return err.message;
	if (err instanceof Error) return err.message;
	return String(err);
}

function clampInt(n: number, min: number, max: number): number {
	if (!Number.isFinite(n)) return min;
	return Math.max(min, Math.min(max, Math.floor(n)));
}

export function AIPane({
	activeNoteId,
	activeNoteTitle,
	activeNoteMarkdown,
	selectedCanvasNodes,
	onApplyToActiveNote,
	onCreateNoteFromMarkdown,
}: AIPaneProps) {
	const [profiles, setProfiles] = useState<AiProfile[]>([]);
	const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
	const [profileDraft, setProfileDraft] = useState<AiProfile | null>(null);
	const [apiKeyDraft, setApiKeyDraft] = useState("");
	const [settingsError, setSettingsError] = useState("");

	const [includeActiveNote, setIncludeActiveNote] = useState(true);
	const [includeSelectedNodes, setIncludeSelectedNodes] = useState(true);
	const [charBudget, setCharBudget] = useState(8000);

	const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [jobId, setJobId] = useState<string | null>(null);
	const [streaming, setStreaming] = useState(false);
	const [chatError, setChatError] = useState("");
	const [actionError, setActionError] = useState("");

	const streamingTextRef = useRef("");
	const jobIdRef = useRef<string | null>(null);

	useEffect(() => {
		jobIdRef.current = jobId;
	}, [jobId]);

	const activeProfile = useMemo(() => {
		if (!activeProfileId) return null;
		return profiles.find((p) => p.id === activeProfileId) ?? null;
	}, [activeProfileId, profiles]);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const [list, active] = await Promise.all([
					invoke("ai_profiles_list"),
					invoke("ai_active_profile_get"),
				]);
				if (cancelled) return;
				setProfiles(list);
				setActiveProfileId(active ?? list[0]?.id ?? null);
				if (!active && list[0]?.id) {
					await invoke("ai_active_profile_set", { id: list[0].id });
				}
			} catch (e) {
				if (!cancelled) setSettingsError(errMessage(e));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		setProfileDraft(activeProfile ? structuredClone(activeProfile) : null);
	}, [activeProfile]);

	const createDefaultProfile = useCallback(async () => {
		setSettingsError("");
		try {
			const created = await invoke("ai_profile_upsert", {
				profile: {
					id: "",
					name: "OpenAI",
					provider: "openai",
					model: "gpt-4o-mini",
					base_url: null,
				},
			});
			setProfiles((prev) => [...prev, created]);
			setActiveProfileId(created.id);
			await invoke("ai_active_profile_set", { id: created.id });
		} catch (e) {
			setSettingsError(errMessage(e));
		}
	}, []);

	const saveProfile = useCallback(async () => {
		if (!profileDraft) return;
		setSettingsError("");
		try {
			const saved = await invoke("ai_profile_upsert", {
				profile: profileDraft,
			});
			setProfiles((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
			setActiveProfileId(saved.id);
		} catch (e) {
			setSettingsError(errMessage(e));
		}
	}, [profileDraft]);

	const deleteProfile = useCallback(async () => {
		if (!activeProfileId) return;
		if (!window.confirm("Delete this AI profile?")) return;
		setSettingsError("");
		try {
			await invoke("ai_profile_delete", { id: activeProfileId });
			setProfiles((prev) => prev.filter((p) => p.id !== activeProfileId));
			setActiveProfileId(null);
			setProfileDraft(null);
		} catch (e) {
			setSettingsError(errMessage(e));
		}
	}, [activeProfileId]);

	const setApiKey = useCallback(async () => {
		if (!activeProfileId) return;
		if (!apiKeyDraft.trim()) return;
		setSettingsError("");
		try {
			await invoke("ai_secret_set", {
				profile_id: activeProfileId,
				api_key: apiKeyDraft,
			});
			setApiKeyDraft("");
		} catch (e) {
			setSettingsError(errMessage(e));
		}
	}, [activeProfileId, apiKeyDraft]);

	const clearApiKey = useCallback(async () => {
		if (!activeProfileId) return;
		setSettingsError("");
		try {
			await invoke("ai_secret_clear", { profile_id: activeProfileId });
			setApiKeyDraft("");
		} catch (e) {
			setSettingsError(errMessage(e));
		}
	}, [activeProfileId]);

	const contextPreview = useMemo(() => {
		const parts: string[] = [];
		if (includeActiveNote && activeNoteId && activeNoteMarkdown) {
			parts.push(
				`# Active Note\nid: ${activeNoteId}\ntitle: ${activeNoteTitle ?? ""}\n\n${activeNoteMarkdown}`,
			);
		}
		if (includeSelectedNodes && selectedCanvasNodes.length) {
			const lines = selectedCanvasNodes.map((n) => {
				const data = n.data ?? {};
				if (n.type === "link") {
					const url = typeof data.url === "string" ? data.url : "";
					const preview =
						(data.preview as Record<string, unknown> | null | undefined) ??
						null;
					const title =
						preview && typeof preview.title === "string" ? preview.title : "";
					const desc =
						preview && typeof preview.description === "string"
							? preview.description
							: "";
					return `- Link: ${title || url}\n  url: ${url}\n  description: ${desc}`;
				}
				if (n.type === "text") {
					const text = typeof data.text === "string" ? data.text : "";
					return `- Text: ${text}`;
				}
				if (n.type === "note") {
					const noteId = typeof data.noteId === "string" ? data.noteId : "";
					const title = typeof data.title === "string" ? data.title : "";
					return `- Note node: ${title}\n  noteId: ${noteId}`;
				}
				if (n.type === "frame") {
					const title = typeof data.title === "string" ? data.title : "";
					return `- Frame: ${title}`;
				}
				return `- Node (${n.type ?? "unknown"})`;
			});
			parts.push(`# Selected Canvas Nodes\n${lines.join("\n")}`);
		}
		const joined = parts.join("\n\n---\n\n").trim();
		if (!joined) return "";
		const limit = clampInt(charBudget, 200, 200_000);
		return joined.length > limit
			? `${joined.slice(0, limit)}\n\n…(truncated)`
			: joined;
	}, [
		activeNoteId,
		activeNoteMarkdown,
		activeNoteTitle,
		charBudget,
		includeActiveNote,
		includeSelectedNodes,
		selectedCanvasNodes,
	]);

	const lastAssistantMessage = useMemo(() => {
		for (let i = chatMessages.length - 1; i >= 0; i--) {
			const m = chatMessages[i];
			if (m?.role !== "assistant") continue;
			if (!m.content.trim()) continue;
			return m.content;
		}
		return "";
	}, [chatMessages]);

	useEffect(() => {
		let unlistenChunk: (() => void) | null = null;
		let unlistenDone: (() => void) | null = null;
		let unlistenError: (() => void) | null = null;
		(async () => {
			unlistenChunk = await listen<{ job_id: string; delta: string }>(
				"ai:chunk",
				(evt) => {
					if (evt.payload.job_id !== jobIdRef.current) return;
					streamingTextRef.current += evt.payload.delta;
					setChatMessages((prev) => {
						const next = prev.slice();
						for (let i = next.length - 1; i >= 0; i--) {
							if (next[i]?.role !== "assistant") continue;
							next[i] = { ...next[i], content: streamingTextRef.current };
							break;
						}
						return next;
					});
				},
			);
			unlistenDone = await listen<{ job_id: string; cancelled: boolean }>(
				"ai:done",
				(evt) => {
					if (evt.payload.job_id !== jobIdRef.current) return;
					setStreaming(false);
					setJobId(null);
				},
			);
			unlistenError = await listen<{ job_id: string; message: string }>(
				"ai:error",
				(evt) => {
					if (evt.payload.job_id !== jobIdRef.current) return;
					setStreaming(false);
					setJobId(null);
					setChatError(evt.payload.message);
				},
			);
		})();
		return () => {
			unlistenChunk?.();
			unlistenDone?.();
			unlistenError?.();
		};
	}, []);

	const startRequest = useCallback(
		async (userText: string, contextOverride?: string) => {
			if (!activeProfileId) {
				setChatError("No AI profile selected.");
				return;
			}
			if (!userText.trim()) return;
			setChatError("");
			setActionError("");
			const nextUser: ChatMessage = {
				id: crypto.randomUUID(),
				role: "user",
				content: userText.trim(),
			};
			streamingTextRef.current = "";
			setChatMessages((prev) => [
				...prev,
				nextUser,
				{ id: crypto.randomUUID(), role: "assistant", content: "" },
			]);
			setStreaming(true);
			try {
				const messagesForRequest: AiMessage[] = [...chatMessages, nextUser].map(
					(m) => ({
						role: m.role,
						content: m.content,
					}),
				);
				const res = await invoke("ai_chat_start", {
					request: {
						profile_id: activeProfileId,
						messages: messagesForRequest,
						context: (contextOverride ?? contextPreview) || undefined,
					},
				});
				setJobId(res.job_id);
			} catch (e) {
				setStreaming(false);
				setChatError(errMessage(e));
				setChatMessages((prev) => prev.filter((m) => m.content !== ""));
			}
		},
		[activeProfileId, chatMessages, contextPreview],
	);

	const onSend = useCallback(async () => {
		if (!activeProfileId) {
			setChatError("No AI profile selected.");
			return;
		}
		if (!input.trim()) return;
		const next = input.trim();
		setInput("");
		await startRequest(next);
	}, [activeProfileId, input, startRequest]);

	const onRewriteActiveNote = useCallback(async () => {
		if (!activeNoteId || !activeNoteMarkdown) {
			setActionError("No active note to rewrite.");
			return;
		}
		const instruction = window.prompt(
			"Rewrite instructions (AI will return full markdown):",
			"Improve clarity and structure, keep meaning, preserve any frontmatter keys.",
		);
		if (!instruction) return;
		const userText = [
			"Rewrite the active note as markdown.",
			`Instruction: ${instruction}`,
			"Return ONLY the full markdown (no code fences).",
		].join("\n");
		const ctx = `# Active Note\nid: ${activeNoteId}\ntitle: ${
			activeNoteTitle ?? ""
		}\n\n${activeNoteMarkdown}`;
		await startRequest(userText, ctx);
	}, [activeNoteId, activeNoteMarkdown, activeNoteTitle, startRequest]);

	const onApplyLastAssistantToActiveNote = useCallback(async () => {
		if (!activeNoteId) {
			setActionError("No active note selected.");
			return;
		}
		if (!lastAssistantMessage.trim()) {
			setActionError("No assistant message to apply.");
			return;
		}
		if (
			!window.confirm(
				"Replace the active note with the last assistant message?",
			)
		)
			return;
		setActionError("");
		try {
			await onApplyToActiveNote(lastAssistantMessage);
		} catch (e) {
			setActionError(errMessage(e));
		}
	}, [activeNoteId, lastAssistantMessage, onApplyToActiveNote]);

	const onCreateNoteFromLastAssistant = useCallback(async () => {
		if (!lastAssistantMessage.trim()) {
			setActionError("No assistant message to use.");
			return;
		}
		const title = window.prompt("New note title:", "AI Note");
		if (title == null) return;
		setActionError("");
		try {
			await onCreateNoteFromMarkdown(title, lastAssistantMessage);
		} catch (e) {
			setActionError(errMessage(e));
		}
	}, [lastAssistantMessage, onCreateNoteFromMarkdown]);

	const onCancel = useCallback(async () => {
		if (!jobId) return;
		try {
			await invoke("ai_chat_cancel", { job_id: jobId });
		} catch {
			// ignore
		}
	}, [jobId]);

	return (
		<div className="aiPane">
			<div className="aiHeader">
				<div className="aiTitle">AI</div>
				<div className="aiMeta">{activeProfile?.name ?? "No profile"}</div>
			</div>

			{profiles.length ? (
				<div className="aiRow">
					<label className="aiLabel" htmlFor="aiProfile">
						Profile
					</label>
					<select
						id="aiProfile"
						value={activeProfileId ?? ""}
						onChange={async (e) => {
							const id = e.target.value || null;
							setActiveProfileId(id);
							await invoke("ai_active_profile_set", { id });
						}}
					>
						{profiles.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name}
							</option>
						))}
					</select>
					<button type="button" onClick={deleteProfile}>
						Delete
					</button>
				</div>
			) : (
				<div className="aiRow">
					<button type="button" onClick={createDefaultProfile}>
						Create OpenAI profile
					</button>
				</div>
			)}

			{profileDraft ? (
				<div className="aiSettings">
					<div className="aiRow">
						<label className="aiLabel" htmlFor="aiName">
							Name
						</label>
						<input
							id="aiName"
							value={profileDraft.name}
							onChange={(e) =>
								setProfileDraft((p) => (p ? { ...p, name: e.target.value } : p))
							}
						/>
					</div>
					<div className="aiRow">
						<label className="aiLabel" htmlFor="aiProvider">
							Provider
						</label>
						<select
							id="aiProvider"
							value={profileDraft.provider}
							onChange={(e) =>
								setProfileDraft((p) =>
									p
										? {
												...p,
												provider: e.target.value as AiProfile["provider"],
											}
										: p,
								)
							}
						>
							<option value="openai">OpenAI</option>
							<option value="openai_compat">OpenAI-compatible</option>
						</select>
					</div>
					<div className="aiRow">
						<label className="aiLabel" htmlFor="aiModel">
							Model
						</label>
						<input
							id="aiModel"
							value={profileDraft.model}
							onChange={(e) =>
								setProfileDraft((p) =>
									p ? { ...p, model: e.target.value } : p,
								)
							}
						/>
					</div>
					<div className="aiRow">
						<label className="aiLabel" htmlFor="aiBaseUrl">
							Base URL
						</label>
						<input
							id="aiBaseUrl"
							placeholder="(optional)"
							value={profileDraft.base_url ?? ""}
							onChange={(e) =>
								setProfileDraft((p) =>
									p ? { ...p, base_url: e.target.value || null } : p,
								)
							}
						/>
					</div>
					<div className="aiRow">
						<label className="aiLabel" htmlFor="aiApiKey">
							API key
						</label>
						<input
							id="aiApiKey"
							placeholder="sk-…"
							value={apiKeyDraft}
							onChange={(e) => setApiKeyDraft(e.target.value)}
						/>
						<button type="button" onClick={setApiKey}>
							Set
						</button>
						<button type="button" onClick={clearApiKey}>
							Clear
						</button>
					</div>
					<div className="aiRow">
						<button type="button" onClick={saveProfile}>
							Save profile
						</button>
					</div>
				</div>
			) : null}

			{settingsError ? <div className="aiError">{settingsError}</div> : null}

			<details className="aiContext" open>
				<summary>Context preview</summary>
				<div className="aiRow">
					<label className="aiLabel" htmlFor="aiBudget">
						Budget
					</label>
					<input
						id="aiBudget"
						type="number"
						min={200}
						max={200000}
						value={charBudget}
						onChange={(e) => setCharBudget(Number(e.target.value))}
					/>
					<label className="aiToggle">
						<input
							type="checkbox"
							checked={includeActiveNote}
							onChange={() => setIncludeActiveNote((v) => !v)}
						/>
						Active note
					</label>
					<label className="aiToggle">
						<input
							type="checkbox"
							checked={includeSelectedNodes}
							onChange={() => setIncludeSelectedNodes((v) => !v)}
						/>
						Selected nodes ({selectedCanvasNodes.length})
					</label>
				</div>
				<textarea
					className="aiContextPreview mono"
					readOnly
					value={contextPreview}
				/>
			</details>

			<div className="aiActions">
				<div className="aiRow">
					<button
						type="button"
						onClick={onRewriteActiveNote}
						disabled={streaming || !activeNoteId || !activeNoteMarkdown}
					>
						Rewrite active note
					</button>
					<button
						type="button"
						onClick={onApplyLastAssistantToActiveNote}
						disabled={
							streaming || !activeNoteId || !lastAssistantMessage.trim()
						}
					>
						Apply last assistant
					</button>
					<button
						type="button"
						onClick={onCreateNoteFromLastAssistant}
						disabled={streaming || !lastAssistantMessage.trim()}
					>
						Create note
					</button>
				</div>
				{actionError ? <div className="aiError">{actionError}</div> : null}
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

			<div className="aiChat">
				<div className="aiChatMessages">
					{chatMessages.map((m) => (
						<div key={m.id} className={`aiChatMsg aiChatMsg-${m.role}`}>
							<div className="aiChatRole">{m.role}</div>
							<div className="aiChatContent mono">{m.content}</div>
						</div>
					))}
				</div>

				<textarea
					className="aiChatInput"
					placeholder="Ask…"
					value={input}
					disabled={streaming}
					onChange={(e) => setInput(e.target.value)}
				/>
				<div className="aiChatActions">
					<button
						type="button"
						onClick={onSend}
						disabled={streaming || !input.trim()}
					>
						Send
					</button>
					<button
						type="button"
						onClick={onCancel}
						disabled={!streaming || !jobId}
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={() => {
							setChatMessages([]);
							setChatError("");
						}}
						disabled={streaming}
					>
						Clear
					</button>
				</div>
				{chatError ? <div className="aiError">{chatError}</div> : null}
			</div>
		</div>
	);
}
