import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type AiHeader,
	type AiMessage,
	type AiProfile,
	type CanvasDoc,
	type LinkPreview,
	type NoteMeta,
	TauriInvokeError,
	invoke,
} from "../lib/tauri";
import { unifiedDiff } from "../lib/diff";

type ChatMessage = AiMessage & { id: string };

type ContextSpec = {
	neighborDepth: 0 | 1 | 2;
	includeNoteContents: boolean;
	includeLinkPreviewText: boolean;
	includeActiveNote: boolean;
	includeSelectedNodes: boolean;
	charBudget: number;
};

type ContextManifestItem = {
	kind: string;
	label: string;
	chars: number;
	estTokens: number;
	truncated: boolean;
};

type ContextManifest = {
	spec: ContextSpec;
	items: ContextManifestItem[];
	totalChars: number;
	estTokens: number;
};

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
	canvasDoc: CanvasDoc | null;
	onApplyToActiveNote: (markdown: string) => Promise<void>;
	onCreateNoteFromMarkdown: (
		title: string,
		markdown: string,
	) => Promise<NoteMeta | null>;
	onAddCanvasNoteNode: (noteId: string, title: string) => void;
	onAddCanvasTextNode: (text: string) => void;
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

function estimateTokens(chars: number): number {
	return Math.ceil(chars / 4);
}

function truncateWithNotice(
	text: string,
	maxChars: number,
): { text: string; truncated: boolean } {
	if (maxChars <= 0) return { text: "", truncated: true };
	if (text.length <= maxChars) return { text, truncated: false };
	const suffix = "\n…(truncated)";
	const keep = Math.max(0, maxChars - suffix.length);
	return { text: `${text.slice(0, keep)}${suffix}`, truncated: true };
}

function headersToText(headers: AiHeader[]): string {
	return headers
		.map((h) => `${h.key}: ${h.value}`)
		.join("\n")
		.trim();
}

function parseHeadersText(text: string): AiHeader[] {
	const lines = text
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
	const out: AiHeader[] = [];
	for (const line of lines) {
		const idx = line.indexOf(":");
		if (idx <= 0) continue;
		const key = line.slice(0, idx).trim();
		const value = line.slice(idx + 1).trim();
		if (!key) continue;
		out.push({ key, value });
	}
	return out;
}

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
	const [profiles, setProfiles] = useState<AiProfile[]>([]);
	const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
	const [profileDraft, setProfileDraft] = useState<AiProfile | null>(null);
	const [apiKeyDraft, setApiKeyDraft] = useState("");
	const [settingsError, setSettingsError] = useState("");
	const [secretConfigured, setSecretConfigured] = useState<boolean | null>(
		null,
	);
	const [headersText, setHeadersText] = useState("");

	const [includeActiveNote, setIncludeActiveNote] = useState(true);
	const [includeSelectedNodes, setIncludeSelectedNodes] = useState(true);
	const [includeNoteContents, setIncludeNoteContents] = useState(true);
	const [includeLinkPreviewText, setIncludeLinkPreviewText] = useState(true);
	const [neighborDepth, setNeighborDepth] = useState<0 | 1 | 2>(0);
	const [charBudget, setCharBudget] = useState(8000);
	const [payloadPreview, setPayloadPreview] = useState("");
	const [payloadApproved, setPayloadApproved] = useState(false);
	const [payloadManifest, setPayloadManifest] =
		useState<ContextManifest | null>(null);
	const [payloadError, setPayloadError] = useState("");

	const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [jobId, setJobId] = useState<string | null>(null);
	const [lastCompletedJobId, setLastCompletedJobId] = useState<string | null>(
		null,
	);
	const [streaming, setStreaming] = useState(false);
	const [chatError, setChatError] = useState("");
	const [actionError, setActionError] = useState("");

	const streamingTextRef = useRef("");
	const jobIdRef = useRef<string | null>(null);
	const pendingActionRef = useRef<"chat" | "rewrite_active_note">("chat");
	const [stagedRewrite, setStagedRewrite] = useState<{
		jobId: string;
		proposedMarkdown: string;
	} | null>(null);

	const contextSpec = useMemo<ContextSpec>(
		() => ({
			neighborDepth,
			includeNoteContents,
			includeLinkPreviewText,
			includeActiveNote,
			includeSelectedNodes,
			charBudget: clampInt(charBudget, 200, 200_000),
		}),
		[
			charBudget,
			includeActiveNote,
			includeLinkPreviewText,
			includeNoteContents,
			includeSelectedNodes,
			neighborDepth,
		],
	);

	const payloadInvalidationKey = useMemo(() => {
		const selectedIds = selectedCanvasNodes.map((n) => n.id).join(",");
		const noteKey = activeNoteId
			? `${activeNoteId}:${(activeNoteMarkdown ?? "").length}`
			: "";
		const canvasKey = canvasDoc?.id ?? "";
		return JSON.stringify({
			selectedIds,
			noteKey,
			canvasKey,
			contextSpec,
		});
	}, [
		activeNoteId,
		activeNoteMarkdown,
		canvasDoc?.id,
		contextSpec,
		selectedCanvasNodes,
	]);

	useEffect(() => {
		// Reference the invalidation key so the effect intentionally runs when context changes.
		void payloadInvalidationKey;
		setPayloadApproved(false);
		setPayloadError("");
		// Keep the last preview visible, but require re-approval after any context change.
	}, [payloadInvalidationKey]);

	useEffect(() => {
		jobIdRef.current = jobId;
	}, [jobId]);

	const activeNoteIdRef = useRef<string | null>(null);
	const activeNoteMarkdownRef = useRef<string | null>(null);
	useEffect(() => {
		activeNoteIdRef.current = activeNoteId;
		activeNoteMarkdownRef.current = activeNoteMarkdown;
	}, [activeNoteId, activeNoteMarkdown]);

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
		setHeadersText(activeProfile ? headersToText(activeProfile.headers) : "");
	}, [activeProfile]);

	useEffect(() => {
		if (!activeProfileId) {
			setSecretConfigured(null);
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const configured = await invoke("ai_secret_status", {
					profile_id: activeProfileId,
				});
				if (!cancelled) setSecretConfigured(configured);
			} catch {
				if (!cancelled) setSecretConfigured(null);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [activeProfileId]);

	const createDefaultProfile = useCallback(async () => {
		setSettingsError("");
		try {
			const created = await invoke("ai_profile_upsert", {
				profile: {
					id: "",
					name: "AI Profile",
					provider: "openai",
					model: "gpt-4o-mini",
					base_url: null,
					headers: [],
					allow_private_hosts: false,
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
			const nextProfile: AiProfile = {
				...profileDraft,
				headers: parseHeadersText(headersText),
			};
			const saved = await invoke("ai_profile_upsert", {
				profile: nextProfile,
			});
			setProfiles((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
			setActiveProfileId(saved.id);
		} catch (e) {
			setSettingsError(errMessage(e));
		}
	}, [headersText, profileDraft]);

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
			setSecretConfigured(true);
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
			setSecretConfigured(false);
		} catch (e) {
			setSettingsError(errMessage(e));
		}
	}, [activeProfileId]);

	const noteCacheRef = useRef<Map<string, { title: string; markdown: string }>>(
		new Map(),
	);
	const linkPreviewCacheRef = useRef<Map<string, LinkPreview>>(new Map());

	const buildPayload = useCallback(async () => {
		setPayloadError("");
		setPayloadApproved(false);

		try {
			const items: ContextManifestItem[] = [];
			const parts: string[] = [];
			let remaining = contextSpec.charBudget;

			const pushItem = (kind: string, label: string, text: string) => {
				if (!text.trim()) return;
				const { text: clipped, truncated } = truncateWithNotice(
					text.trim(),
					remaining,
				);
				if (!clipped.trim()) return;
				parts.push(clipped);
				const chars = clipped.length;
				items.push({
					kind,
					label,
					chars,
					estTokens: estimateTokens(chars),
					truncated,
				});
				remaining = Math.max(0, remaining - chars);
			};

			const splitFrontmatter = (md: string): string => {
				if (md.startsWith("---\n")) {
					const idx = md.indexOf("\n---\n", 4);
					if (idx !== -1) return md.slice(idx + "\n---\n".length);
				}
				if (md.startsWith("---\r\n")) {
					const idx = md.indexOf("\r\n---\r\n", 5);
					if (idx !== -1) return md.slice(idx + "\r\n---\r\n".length);
				}
				return md;
			};

			const noteExcerpt = (md: string, budget: number): string => {
				const body = splitFrontmatter(md).trim();
				if (!body) return "";
				const lines = body.split("\n");
				const headings: string[] = [];
				for (const line of lines) {
					if (line.startsWith("#")) {
						headings.push(line.trim());
					}
					if (headings.length >= 16) break;
				}
				const headingBlock = headings.length
					? `Headings:\n${headings.map((h) => `- ${h}`).join("\n")}\n\n`
					: "";
				const remainderBudget = Math.max(0, budget - headingBlock.length);
				const excerpt = body.slice(0, remainderBudget);
				return `${headingBlock}${excerpt}`.trim();
			};

			const getNote = async (noteId: string) => {
				const cached = noteCacheRef.current.get(noteId);
				if (cached) return cached;
				const doc = await invoke("note_read", { id: noteId });
				const next = { title: doc.meta.title, markdown: doc.markdown };
				noteCacheRef.current.set(noteId, next);
				return next;
			};

			const getLinkPreview = async (
				url: string,
			): Promise<LinkPreview | null> => {
				const cached = linkPreviewCacheRef.current.get(url);
				if (cached) return cached;
				try {
					const preview = await invoke("link_preview", { url });
					linkPreviewCacheRef.current.set(url, preview);
					return preview;
				} catch {
					return null;
				}
			};

			if (contextSpec.includeActiveNote && activeNoteId) {
				const title = activeNoteTitle ?? "";
				const md = activeNoteMarkdown ?? "";
				const header =
					`# Active Note\nid: ${activeNoteId}\ntitle: ${title}`.trim();
				const content =
					contextSpec.includeNoteContents && md
						? `\n\n${noteExcerpt(md, remaining)}`
						: "";
				pushItem("active_note", title || activeNoteId, `${header}${content}`);
			}

			if (contextSpec.includeSelectedNodes && selectedCanvasNodes.length) {
				const selectedIds = selectedCanvasNodes.map((n) => n.id);
				const nodesById = new Map(
					(canvasDoc?.nodes ?? []).map((n) => [n.id, n] as const),
				);
				const edges = canvasDoc?.edges ?? [];
				const adj = new Map<string, Set<string>>();
				const addAdj = (a: string, b: string) => {
					if (!a || !b) return;
					const set = adj.get(a) ?? new Set<string>();
					set.add(b);
					adj.set(a, set);
				};
				for (const e of edges) {
					addAdj(e.source, e.target);
					addAdj(e.target, e.source);
				}

				const included = new Set<string>(selectedIds);
				let frontier = selectedIds.slice();
				const ordered = selectedIds.slice();
				for (let depth = 0; depth < contextSpec.neighborDepth; depth++) {
					const next: string[] = [];
					for (const id of frontier) {
						const neighbors = adj.get(id);
						if (!neighbors) continue;
						for (const nb of neighbors) {
							if (included.has(nb)) continue;
							included.add(nb);
							next.push(nb);
						}
					}
					ordered.push(...next);
					frontier = next;
				}

				for (const nodeId of ordered) {
					if (!remaining) break;
					const fromDoc = nodesById.get(nodeId);
					const fallback =
						selectedCanvasNodes.find((n) => n.id === nodeId) ?? null;
					const type = fromDoc?.type ?? fallback?.type ?? "unknown";
					const data =
						(fromDoc?.data as Record<string, unknown> | null | undefined) ??
						fallback?.data ??
						{};

					if (type === "note") {
						const noteId =
							typeof data.noteId === "string"
								? data.noteId
								: typeof data.note_id === "string"
									? data.note_id
									: "";
						const cachedTitle =
							typeof data.title === "string" ? data.title : "Note";
						const note = noteId ? await getNote(noteId) : null;
						const title = note?.title ?? cachedTitle;
						const header =
							`# Canvas Note Node\nnodeId: ${nodeId}\nnoteId: ${noteId}\ntitle: ${title}`.trim();
						const content =
							contextSpec.includeNoteContents && note?.markdown
								? `\n\n${noteExcerpt(note.markdown, remaining)}`
								: "";
						pushItem("canvas_note", title, `${header}${content}`);
						continue;
					}

					if (type === "link") {
						const url = typeof data.url === "string" ? data.url : "";
						const preview =
							(data.preview as LinkPreview | null | undefined) ??
							(url ? await getLinkPreview(url) : null);
						const title = preview?.title ? preview.title : url || "Link";
						const header =
							`# Canvas Link Node\nnodeId: ${nodeId}\nurl: ${url}\ntitle: ${title}`.trim();
						const desc =
							contextSpec.includeLinkPreviewText && preview?.description
								? `\n\ndescription: ${preview.description}`
								: "";
						pushItem("canvas_link", title, `${header}${desc}`);
						continue;
					}

					if (type === "text") {
						const text = typeof data.text === "string" ? data.text : "";
						const header = `# Canvas Text Node\nnodeId: ${nodeId}`.trim();
						const content = text ? `\n\n${text}` : "";
						pushItem("canvas_text", "Text node", `${header}${content}`);
						continue;
					}

					if (type === "frame") {
						const title = typeof data.title === "string" ? data.title : "Frame";
						const header =
							`# Canvas Frame\nnodeId: ${nodeId}\ntitle: ${title}`.trim();
						pushItem("canvas_frame", title, header);
						continue;
					}

					pushItem(
						"canvas_node",
						`${type}`,
						`# Canvas Node\nnodeId: ${nodeId}\ntype: ${type}`,
					);
				}
			}

			const payload = parts.join("\n\n---\n\n").trim();
			const totalChars = payload.length;
			const manifest: ContextManifest = {
				spec: contextSpec,
				items,
				totalChars,
				estTokens: estimateTokens(totalChars),
			};
			setPayloadPreview(payload);
			setPayloadManifest(manifest);
		} catch (e) {
			setPayloadError(errMessage(e));
		}
	}, [
		activeNoteId,
		activeNoteMarkdown,
		activeNoteTitle,
		canvasDoc,
		contextSpec,
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
					setLastCompletedJobId(evt.payload.job_id);
					if (pendingActionRef.current === "rewrite_active_note") {
						setStagedRewrite({
							jobId: evt.payload.job_id,
							proposedMarkdown: streamingTextRef.current,
						});
					}
					pendingActionRef.current = "chat";
				},
			);
			unlistenError = await listen<{ job_id: string; message: string }>(
				"ai:error",
				(evt) => {
					if (evt.payload.job_id !== jobIdRef.current) return;
					setStreaming(false);
					setJobId(null);
					setChatError(evt.payload.message);
					pendingActionRef.current = "chat";
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
		async (userText: string) => {
			if (!activeProfileId) {
				setChatError("No AI profile selected.");
				return;
			}
			if (!userText.trim()) return;
			if (!payloadApproved) {
				setChatError("Approve the context payload before sending.");
				return;
			}
			if (!payloadManifest) {
				setChatError("Build the context payload first.");
				return;
			}
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
						context: payloadPreview || undefined,
						context_manifest: payloadManifest ?? undefined,
						audit: true,
					},
				});
				setJobId(res.job_id);
			} catch (e) {
				setStreaming(false);
				setChatError(errMessage(e));
				setChatMessages((prev) => prev.filter((m) => m.content !== ""));
			}
		},
		[
			activeProfileId,
			chatMessages,
			payloadApproved,
			payloadManifest,
			payloadPreview,
		],
	);

	const onSend = useCallback(async () => {
		if (!activeProfileId) {
			setChatError("No AI profile selected.");
			return;
		}
		if (!input.trim()) return;
		pendingActionRef.current = "chat";
		const next = input.trim();
		setInput("");
		await startRequest(next);
	}, [activeProfileId, input, startRequest]);

	const onRewriteActiveNote = useCallback(async () => {
		if (!activeNoteId || !activeNoteMarkdown) {
			setActionError("No active note to rewrite.");
			return;
		}
		if (!includeActiveNote) {
			setActionError("Enable Active note in the payload spec, then build + approve.");
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
		activeNoteMarkdown,
		includeActiveNote,
		payloadApproved,
		payloadManifest,
		startRequest,
	]);

	const stageRewriteFromLastAssistant = useCallback(() => {
		if (!activeNoteId) {
			setActionError("No active note selected.");
			return;
		}
		if (!activeNoteMarkdown) {
			setActionError("No active note loaded.");
			return;
		}
		if (!lastAssistantMessage.trim()) {
			setActionError("No assistant message to stage.");
			return;
		}
		const jobId = lastCompletedJobId ?? "unknown";
		setStagedRewrite({ jobId, proposedMarkdown: lastAssistantMessage });
		setActionError("");
	}, [activeNoteId, activeNoteMarkdown, lastAssistantMessage, lastCompletedJobId]);

	const stagedRewriteDiff = useMemo(() => {
		if (!stagedRewrite || !activeNoteMarkdown) return "";
		return unifiedDiff(activeNoteMarkdown, stagedRewrite.proposedMarkdown, {
			contextLines: 3,
			maxDiffLines: 5000,
		});
	}, [activeNoteMarkdown, stagedRewrite]);

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
						Create profile
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
							<option value="openrouter">OpenRouter</option>
							<option value="anthropic">Anthropic</option>
							<option value="gemini">Gemini</option>
							<option value="ollama">Ollama</option>
						</select>
					</div>
					<div className="aiRow">
						<label className="aiLabel" htmlFor="aiAllowPrivate">
							Network
						</label>
						<label className="aiToggle">
							<input
								id="aiAllowPrivate"
								type="checkbox"
								checked={profileDraft.allow_private_hosts}
								onChange={() =>
									setProfileDraft((p) =>
										p
											? { ...p, allow_private_hosts: !p.allow_private_hosts }
											: p,
									)
								}
							/>
							Allow localhost/private
						</label>
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
							placeholder="(optional override)"
							value={profileDraft.base_url ?? ""}
							onChange={(e) =>
								setProfileDraft((p) =>
									p ? { ...p, base_url: e.target.value || null } : p,
								)
							}
						/>
					</div>
					<div className="aiRow">
						<label className="aiLabel" htmlFor="aiHeaders">
							Headers
						</label>
						<textarea
							id="aiHeaders"
							className="mono"
							placeholder={"Header-Name: value\nX-Other: value"}
							value={headersText}
							onChange={(e) => setHeadersText(e.target.value)}
						/>
					</div>
					<div className="aiRow">
						<label className="aiLabel" htmlFor="aiApiKey">
							API key
						</label>
						<div className="aiMeta">
							{secretConfigured == null
								? ""
								: secretConfigured
									? "Configured"
									: "Not set"}
						</div>
					</div>
					<div className="aiRow">
						<label className="aiLabel" htmlFor="aiApiKeyInput">
							Set key
						</label>
						<input
							id="aiApiKeyInput"
							placeholder="paste key…"
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
				<summary>Context payload</summary>
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
					<label className="aiLabel" htmlFor="aiDepth">
						Neighbors
					</label>
					<select
						id="aiDepth"
						value={neighborDepth}
						onChange={(e) =>
							setNeighborDepth(Number(e.target.value) as 0 | 1 | 2)
						}
					>
						<option value={0}>0</option>
						<option value={1}>1</option>
						<option value={2}>2</option>
					</select>
				</div>
				<div className="aiRow">
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
					<label className="aiToggle">
						<input
							type="checkbox"
							checked={includeNoteContents}
							onChange={() => setIncludeNoteContents((v) => !v)}
						/>
						Note contents
					</label>
					<label className="aiToggle">
						<input
							type="checkbox"
							checked={includeLinkPreviewText}
							onChange={() => setIncludeLinkPreviewText((v) => !v)}
						/>
						Link preview text
					</label>
				</div>
				<div className="aiRow">
					<button type="button" onClick={buildPayload} disabled={streaming}>
						Build payload
					</button>
					<label className="aiToggle">
						<input
							type="checkbox"
							checked={payloadApproved}
							onChange={() => setPayloadApproved((v) => !v)}
						/>
						Approve payload
					</label>
					<div className="aiMeta">
						{payloadManifest
							? `${payloadManifest.totalChars.toLocaleString()} chars • ~${payloadManifest.estTokens.toLocaleString()} tokens`
							: ""}
					</div>
				</div>
				{payloadError ? <div className="aiError">{payloadError}</div> : null}
				<textarea
					className="aiContextPreview mono"
					readOnly
					value={payloadPreview}
				/>
				{payloadManifest?.items.length ? (
					<ul className="aiManifest">
						{payloadManifest.items.map((it, idx) => (
							<li key={`${it.kind}-${idx}`}>
								<span className="mono">
									{it.kind} • {it.chars}c • ~{it.estTokens}t
									{it.truncated ? " • truncated" : ""}
								</span>
								{" — "}
								{it.label}
							</li>
						))}
					</ul>
				) : null}
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
						onClick={stageRewriteFromLastAssistant}
						disabled={
							streaming || !activeNoteId || !lastAssistantMessage.trim()
						}
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
							<button type="button" onClick={applyStagedRewrite} disabled={streaming}>
								Apply staged rewrite
							</button>
							<button type="button" onClick={rejectStagedRewrite} disabled={streaming}>
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
