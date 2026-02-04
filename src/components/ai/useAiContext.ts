import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type FsEntry, TauriInvokeError, invoke } from "../../lib/tauri";

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

function errMessage(err: unknown): string {
	if (err instanceof TauriInvokeError) return err.message;
	if (err instanceof Error) return err.message;
	return String(err);
}

function estimateTokens(chars: number): number {
	return Math.ceil(chars / 4);
}

function normalizeRelPath(path: string): string {
	return path.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

const FILE_LIST_LIMIT = 20_000;
const READ_CHUNK_SIZE = 24;
const DEFAULT_CHAR_BUDGET = 12_000;
const MAX_VISIBLE_FOLDERS = 120;

export function useAiContext({
	activeFolderPath,
}: {
	activeFolderPath: string | null;
}) {
	const [pinnedFolders, setPinnedFolders] = useState<string[]>([]);
	const [removedActiveFolder, setRemovedActiveFolder] = useState(false);
	const [contextSearch, setContextSearch] = useState("");
	const [folderIndex, setFolderIndex] = useState<FolderEntry[]>([]);
	const [folderIndexError, setFolderIndexError] = useState("");
	const [payloadPreview, setPayloadPreview] = useState("");
	const [payloadManifest, setPayloadManifest] =
		useState<ContextManifest | null>(null);
	const [payloadError, setPayloadError] = useState("");
	const [payloadBuilding, setPayloadBuilding] = useState(false);
	const [charBudget, setCharBudget] = useState(DEFAULT_CHAR_BUDGET);

	const folderFilesCacheRef = useRef<Map<string, string[]>>(new Map());
	const fileTextCacheRef = useRef<Map<string, string>>(new Map());

	const normalizedActive = useMemo(() => {
		const next =
			activeFolderPath != null ? normalizeRelPath(activeFolderPath) : "";
		return next;
	}, [activeFolderPath]);
	const hasActiveFolder = activeFolderPath !== null;

	useEffect(() => {
		setRemovedActiveFolder(false);
	}, [normalizedActive]);

	const attachedFolders = useMemo(() => {
		const seen = new Set<string>();
		const list: FolderEntry[] = [];
		if (hasActiveFolder && !removedActiveFolder) {
			seen.add(normalizedActive);
			list.push({
				path: normalizedActive,
				label: normalizedActive || "Vault",
			});
		}
		for (const raw of pinnedFolders) {
			const path = normalizeRelPath(raw);
			if (!path && !normalizedActive) {
				if (!seen.has(path)) {
					seen.add(path);
					list.push({ path: "", label: "Vault" });
				}
				continue;
			}
			if (!path || seen.has(path)) continue;
			seen.add(path);
			list.push({ path, label: path });
		}
		return list;
	}, [normalizedActive, pinnedFolders, removedActiveFolder]);

	const addFolder = useCallback(
		(path: string) => {
			const normalized = normalizeRelPath(path);
			if (path == null) return;
			if (normalized === normalizedActive) {
				setRemovedActiveFolder(false);
				return;
			}
			setPinnedFolders((prev) => {
				if (prev.includes(normalized)) return prev;
				return [...prev, normalized];
			});
		},
		[normalizedActive],
	);

	const removeFolder = useCallback(
		(path: string) => {
			const normalized = normalizeRelPath(path);
			if (normalized === normalizedActive) {
				setRemovedActiveFolder(true);
				return;
			}
			setPinnedFolders((prev) => prev.filter((p) => p !== normalized));
		},
		[normalizedActive],
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
				setFolderIndex(next);
			} catch (e) {
				if (cancelled) return;
				setFolderIndexError(errMessage(e));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const filteredFolders = useMemo(() => {
		const q = contextSearch.trim().toLowerCase();
		if (!q) return folderIndex;
		return folderIndex.filter((f) =>
			f.label.toLowerCase().includes(q),
		);
	}, [contextSearch, folderIndex]);

	const visibleFolders = useMemo(
		() => filteredFolders.slice(0, MAX_VISIBLE_FOLDERS),
		[filteredFolders],
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

			for (const folder of attachedFolders) {
				if (!remaining) break;
				pushItem("folder", folder.label, `# Folder: ${folder.label}`);
				if (!remaining) break;
				const paths = await readFolderFiles(folder.path);
				for (let i = 0; i < paths.length; i += READ_CHUNK_SIZE) {
					if (!remaining) break;
					const chunk = paths.slice(i, i + READ_CHUNK_SIZE);
					const docs = await invoke("vault_read_texts_batch", {
						paths: chunk,
					});
					for (const doc of docs) {
						if (!remaining) break;
						if (!doc.text || doc.error) continue;
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
			setPayloadError(errMessage(e));
			return { payload: "", manifest: null };
		} finally {
			setPayloadBuilding(false);
		}
	}, [attachedFolders, charBudget, readFolderFiles]);

	const ensurePayload = useCallback(async () => {
		if (payloadManifest && payloadPreview) {
			return { payload: payloadPreview, manifest: payloadManifest };
		}
		return buildPayload();
	}, [buildPayload, payloadManifest, payloadPreview]);

	return {
		attachedFolders,
		addFolder,
		removeFolder,
		contextSearch,
		setContextSearch,
		folderIndexError,
		filteredFolders,
		visibleFolders,
		payloadPreview,
		payloadManifest,
		payloadError,
		payloadBuilding,
		buildPayload,
		ensurePayload,
		charBudget,
		setCharBudget,
	};
}
