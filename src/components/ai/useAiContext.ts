import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import { queryClient } from "../../lib/queryClient";
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

const aiContextIndexQueryKey = ["ai", "context", "index"] as const;

export function clearAiContextCache() {
	queryClient.removeQueries({ queryKey: aiContextIndexQueryKey });
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
	return queryClient.fetchQuery({
		queryKey: aiContextIndexQueryKey,
		queryFn: async () => {
			const index = await invoke("ai_context_index");
			return {
				folders: index.folders,
				files: index.files,
			};
		},
	});
}

export function useAiContext(contextSearch = "") {
	const [attachedContext, setAttachedContext] = useState<ContextEntry[]>([]);
	const indexQuery = useQuery({
		queryKey: aiContextIndexQueryKey,
		queryFn: async () => {
			const index = await invoke("ai_context_index");
			return {
				folders: index.folders,
				files: index.files,
			} satisfies AiContextIndexData;
		},
	});
	const folderIndex = indexQuery.data?.folders ?? [];
	const fileIndex = indexQuery.data?.files ?? [];

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

	const hasContext = useCallback(
		(kind: ContextEntryKind, rawPath: string) => {
			const path = normalizeRelPath(rawPath);
			return attachedFolders.some(
				(item) => item.kind === kind && item.path === path,
			);
		},
		[attachedFolders],
	);

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

	const buildPayloadMutation = useMutation({
		mutationFn: async () => {
			const built = await invoke("ai_context_build", {
				request: {
					attachments: attachedFolders,
					char_budget: DEFAULT_CHAR_BUDGET,
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
			return { payload: built.payload, manifest };
		},
	});

	const buildPayload = useCallback(async () => {
		try {
			return await buildPayloadMutation.mutateAsync();
		} catch {
			return { payload: "", manifest: null };
		}
	}, [buildPayloadMutation]);

	const ensurePayload = useCallback(async () => {
		return buildPayload();
	}, [buildPayload]);

	return {
		addContext,
		removeContext,
		hasContext,
		resolveMentionsFromInput,
		folderIndexError:
			indexQuery.error != null ? extractErrorMessage(indexQuery.error) : "",
		visibleSuggestions,
		payloadError:
			buildPayloadMutation.error != null
				? extractErrorMessage(buildPayloadMutation.error)
				: "",
		ensurePayload,
	};
}
