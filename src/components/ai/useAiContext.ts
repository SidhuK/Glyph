import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import { type FsEntry, invoke } from "../../lib/tauri";
import { normalizeRelPath } from "../../utils/path";

type ContextManifestItem = {
	kind: string;
	label: string;
	chars: number;
	estTokens: number;
	truncated: boolean;
};

export type ContextManifest = {
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

function estimateTokens(chars: number): number {
	return Math.ceil(chars / 4);
}

const FILE_LIST_LIMIT = 20_000;
const READ_CHUNK_SIZE = 24;
const DEFAULT_CHAR_BUDGET = 12_000;
const MAX_VISIBLE_FOLDERS = 120;
const MENTION_RE = /(^|\s)@([^\s@]+)/g;

function folderLabel(path: string): string {
	return path || "Vault";
}

function fileLabel(path: string): string {
	return path;
}

function contextKey(kind: ContextEntryKind, path: string): string {
	return `${kind}:${path}`;
}

export function useAiContext({
	activeFolderPath: _activeFolderPath,
}: {
	activeFolderPath: string | null;
}) {
	const [attachedContext, setAttachedContext] = useState<ContextEntry[]>([]);
	const [contextSearch, setContextSearch] = useState("");
	const [folderIndex, setFolderIndex] = useState<FolderEntry[]>([]);
	const [fileIndex, setFileIndex] = useState<FolderEntry[]>([]);
	const [folderIndexError, setFolderIndexError] = useState("");
	const [payloadPreview, setPayloadPreview] = useState("");
	const [payloadManifest, setPayloadManifest] =
		useState<ContextManifest | null>(null);
	const [payloadError, setPayloadError] = useState("");
	const [payloadBuilding, setPayloadBuilding] = useState(false);
	const [charBudget, setCharBudget] = useState(DEFAULT_CHAR_BUDGET);

	const folderFilesCacheRef = useRef<Map<string, string[]>>(new Map());
	const fileTextCacheRef = useRef<Map<string, string>>(new Map());

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
				const entries = await invoke("vault_list_files", {
					dir: null,
					recursive: true,
					limit: FILE_LIST_LIMIT,
				});
				if (cancelled) return;
				const dirs = new Set<string>();
				dirs.add("");
				for (const entry of entries) {
					const rel = normalizeRelPath(entry.rel_path);
					if (!rel) continue;
					const parts = rel.split("/");
					parts.pop();
					let accum = "";
					for (const part of parts) {
						accum = accum ? `${accum}/${part}` : part;
						dirs.add(accum);
					}
				}
				const next = Array.from(dirs)
					.sort((a, b) => a.localeCompare(b))
					.map((path) => ({
						path,
						label: path || "Vault",
					}));
				const files = entries
					.filter((entry: FsEntry) => entry.kind === "file")
					.map((entry: FsEntry) => ({
						path: normalizeRelPath(entry.rel_path),
						label: fileLabel(normalizeRelPath(entry.rel_path)),
					}));
				setFolderIndex(next);
				setFileIndex(files.sort((a, b) => a.path.localeCompare(b.path)));
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
		const folders = folderIndex.filter((f) => f.label.toLowerCase().includes(q));
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

	const readFolderFiles = useCallback(async (folderPath: string) => {
		const key = folderPath || "";
		const cached = folderFilesCacheRef.current.get(key);
		if (cached) return cached;
		const entries = await invoke("vault_list_files", {
			dir: folderPath || null,
			recursive: true,
			limit: FILE_LIST_LIMIT,
		});
		const files = entries
			.filter((e: FsEntry) => e.kind === "file")
			.map((e: FsEntry) => e.rel_path);
		folderFilesCacheRef.current.set(key, files);
		return files;
	}, []);

	const buildPayload = useCallback(async () => {
		setPayloadError("");
		setPayloadBuilding(true);

		try {
			const items: ContextManifestItem[] = [];
			const parts: string[] = [];
			let remaining = Math.max(200, Math.floor(charBudget));

			const pushItem = (kind: string, label: string, text: string) => {
				if (!text.trim()) return;
				if (!remaining) return;
				const suffix = "\n…(truncated)";
				let clipped = text.trim();
				let truncated = false;
				if (clipped.length > remaining) {
					const keep = Math.max(0, remaining - suffix.length);
					clipped = `${clipped.slice(0, keep)}${suffix}`;
					truncated = true;
				}
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

			const seenFilePaths = new Set<string>();
			for (const item of attachedFolders) {
				if (!remaining) break;
				if (item.kind === "folder") {
					pushItem("folder", item.label, `# Folder: ${item.label}`);
					if (!remaining) break;
					const paths = await readFolderFiles(item.path);
					for (let i = 0; i < paths.length; i += READ_CHUNK_SIZE) {
						if (!remaining) break;
						const chunk = paths.slice(i, i + READ_CHUNK_SIZE);
						const docs = await invoke("vault_read_texts_batch", {
							paths: chunk,
						});
						for (const doc of docs) {
							if (!remaining) break;
							if (!doc.text || doc.error || seenFilePaths.has(doc.rel_path))
								continue;
							seenFilePaths.add(doc.rel_path);
							const cached = fileTextCacheRef.current.get(doc.rel_path);
							const text = cached ?? doc.text;
							fileTextCacheRef.current.set(doc.rel_path, text);
							pushItem(
								"file",
								doc.rel_path,
								`# File: ${doc.rel_path}\n\n${text}`,
							);
						}
					}
					continue;
				}
				if (seenFilePaths.has(item.path)) continue;
				try {
					const doc = await invoke("vault_read_text", { path: item.path });
					seenFilePaths.add(item.path);
					fileTextCacheRef.current.set(item.path, doc.text);
					pushItem("file", item.path, `# File: ${item.path}\n\n${doc.text}`);
				} catch {
					// ignore unreadable attachments
				}
			}

			const payload = parts.join("\n\n---\n\n").trim();
			const totalChars = payload.length;
			const manifest: ContextManifest = {
				items,
				totalChars,
				estTokens: estimateTokens(totalChars),
			};
			setPayloadPreview(payload);
			setPayloadManifest(manifest);
			return { payload, manifest };
		} catch (e) {
			setPayloadError(extractErrorMessage(e));
			return { payload: "", manifest: null };
		} finally {
			setPayloadBuilding(false);
		}
	}, [attachedFolders, charBudget, readFolderFiles]);

	const ensurePayload = useCallback(async () => {
		return buildPayload();
	}, [buildPayload]);

	const resolveAttachedPaths = useCallback(async () => {
		const out: string[] = [];
		const seen = new Set<string>();
		for (const item of attachedFolders) {
			if (item.kind === "file") {
				if (!item.path || seen.has(item.path)) continue;
				seen.add(item.path);
				out.push(item.path);
				continue;
			}
			const paths = await readFolderFiles(item.path);
			for (const path of paths) {
				if (!path || seen.has(path)) continue;
				seen.add(path);
				out.push(path);
			}
		}
		return out;
	}, [attachedFolders, readFolderFiles]);

	return {
		attachedFolders,
		addContext,
		removeContext,
		resolveMentionsFromInput,
		contextSearch,
		setContextSearch,
		folderIndexError,
		visibleSuggestions,
		payloadPreview,
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
