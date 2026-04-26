import { useCallback, useEffect, useMemo, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import { invoke } from "../../lib/tauri";
import { normalizeRelPath } from "../../utils/path";

type ContextManifestItem = {
	kind: string;
	label: string;
	chars: number;
	estTokens: number;
	truncated: boolean;
};

type ContextManifest = {
	items: ContextManifestItem[];
	totalChars: number;
	estTokens: number;
};

type FolderEntry = {
	path: string;
	label: string;
};

type ContextEntryKind = "folder" | "file";

type ContextEntry = {
	kind: ContextEntryKind;
	path: string;
	label: string;
};

type AiContextIndexData = {
	folders: FolderEntry[];
	files: FolderEntry[];
};

const DEFAULT_CHAR_BUDGET = 12_000;
const MAX_VISIBLE_FOLDERS = 120;
const MENTION_RE = /(^|\s)@([^\s@]+)/g;

let aiContextIndexCache: AiContextIndexData | null = null;
let aiContextIndexPromise: Promise<AiContextIndexData | null> | null = null;
let aiContextEpoch = 0;

export function clearAiContextCache() {
	aiContextEpoch += 1;
	aiContextIndexCache = null;
	aiContextIndexPromise = null;
}

function folderLabel(path: string): string {
	return path || "Space";
}

function fileLabel(path: string): string {
	return path;
}

function contextKey(kind: ContextEntryKind, path: string): string {
	return `${kind}:${path}`;
}

export async function preloadAiContextIndex(): Promise<AiContextIndexData | null> {
	if (aiContextIndexCache) return aiContextIndexCache;
	if (!aiContextIndexPromise) {
		const epoch = aiContextEpoch;
		aiContextIndexPromise = invoke("ai_context_index")
			.then((index) => {
				if (epoch !== aiContextEpoch) {
					return null;
				}
				const data = {
					folders: index.folders,
					files: index.files,
				};
				aiContextIndexCache = data;
				return data;
			})
			.finally(() => {
				if (epoch === aiContextEpoch) {
					aiContextIndexPromise = null;
				}
			});
	}
	return aiContextIndexPromise;
}

export function useAiContext(contextSearch = "") {
	const [attachedContext, setAttachedContext] = useState<ContextEntry[]>([]);
	const [folderIndex, setFolderIndex] = useState<FolderEntry[]>(
		() => aiContextIndexCache?.folders ?? [],
	);
	const [fileIndex, setFileIndex] = useState<FolderEntry[]>(
		() => aiContextIndexCache?.files ?? [],
	);
	const [folderIndexError, setFolderIndexError] = useState("");
	const [payloadManifest, setPayloadManifest] =
		useState<ContextManifest | null>(null);
	const [payloadError, setPayloadError] = useState("");
	const [payloadBuilding, setPayloadBuilding] = useState(false);
	const [charBudget, setCharBudget] = useState(DEFAULT_CHAR_BUDGET);

	const attachedFolders = useMemo(() => {
		const seen = new Set<string>();
		const list: ContextEntry[] = [];
		for (const entry of attachedContext) {
			const key = contextKey(entry.kind, entry.path);
			if (seen.has(key)) continue;
			seen.add(key);
			list.push(entry);
		}
		return list;
	}, [attachedContext]);

	const addContext = useCallback((kind: ContextEntryKind, rawPath: string) => {
		const path = normalizeRelPath(rawPath);
		if (kind === "file" && !path) return;
		const label = kind === "folder" ? folderLabel(path) : fileLabel(path);
		setAttachedContext((prev) => {
			const key = contextKey(kind, path);
			if (prev.some((it) => contextKey(it.kind, it.path) === key)) return prev;
			return [...prev, { kind, path, label }];
		});
	}, []);

	const removeContext = useCallback(
		(kind: ContextEntryKind, rawPath: string) => {
			const path = normalizeRelPath(rawPath);
			setAttachedContext((prev) =>
				prev.filter((it) => !(it.kind === kind && it.path === path)),
			);
		},
		[],
	);

	useEffect(() => {
		let cancelled = false;
		setFolderIndexError("");
		void (async () => {
			try {
				const index = await preloadAiContextIndex();
				if (cancelled || !index) return;
				setFolderIndex(index.folders);
				setFileIndex(index.files);
			} catch (e) {
				if (cancelled) return;
				setFolderIndexError(extractErrorMessage(e));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const visibleSuggestions = useMemo(() => {
		const q = contextSearch.trim().toLowerCase();
		if (!q) return [];
		const folders = folderIndex.filter((f) =>
			f.label.toLowerCase().includes(q),
		);
		const files = fileIndex.filter((f) => f.label.toLowerCase().includes(q));
		return [
			...folders.map((f) => ({ kind: "folder" as const, ...f })),
			...files.map((f) => ({ kind: "file" as const, ...f })),
		].slice(0, MAX_VISIBLE_FOLDERS);
	}, [contextSearch, fileIndex, folderIndex]);

	const resolveMentionsFromInput = useCallback(
		(input: string): string => {
			const folderSet = new Set(folderIndex.map((entry) => entry.path));
			const fileSet = new Set(fileIndex.map((entry) => entry.path));
			let mutated = false;
			const cleaned = input.replace(
				MENTION_RE,
				(full, ws: string, token: string) => {
					const path = normalizeRelPath(token);
					if (fileSet.has(path)) {
						addContext("file", path);
						mutated = true;
						return ws;
					}
					if (folderSet.has(path)) {
						addContext("folder", path);
						mutated = true;
						return ws;
					}
					return full;
				},
			);
			if (!mutated) return input.trim();
			return cleaned.replace(/\s{2,}/g, " ").trim();
		},
		[addContext, fileIndex, folderIndex],
	);

	const buildPayload = useCallback(async () => {
		setPayloadError("");
		setPayloadBuilding(true);

		try {
			const built = await invoke("ai_context_build", {
				request: {
					attachments: attachedFolders,
					char_budget: charBudget,
				},
			});
			const manifest: ContextManifest = {
				items: built.manifest.items.map((item) => ({
					kind: item.kind,
					label: item.label,
					chars: item.chars,
					estTokens: item.est_tokens,
					truncated: item.truncated,
				})),
				totalChars: built.manifest.total_chars,
				estTokens: built.manifest.est_tokens,
			};
			setPayloadManifest(manifest);
			return { payload: built.payload, manifest };
		} catch (e) {
			setPayloadError(extractErrorMessage(e));
			return { payload: "", manifest: null };
		} finally {
			setPayloadBuilding(false);
		}
	}, [attachedFolders, charBudget]);

	const ensurePayload = useCallback(async () => {
		return buildPayload();
	}, [buildPayload]);

	const resolveAttachedPaths = useCallback(async () => {
		return invoke("ai_context_resolve_paths", {
			attachments: attachedFolders,
		});
	}, [attachedFolders]);

	return {
		attachedFolders,
		addContext,
		removeContext,
		resolveMentionsFromInput,
		folderIndexError,
		visibleSuggestions,
		payloadManifest,
		payloadError,
		payloadBuilding,
		buildPayload,
		ensurePayload,
		resolveAttachedPaths,
		charBudget,
		setCharBudget,
	};
}
