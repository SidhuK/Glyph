import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type LinkPreview, invoke } from "../../../lib/tauri";
import type { CanvasDocLike } from "../../CanvasPane";
import { buildContextPayload } from "../payloadBuilder";
import type {
	ContextManifest,
	ContextSpec,
	SelectedCanvasNode,
} from "../types";
import { clampInt, errMessage, isUuid } from "../utils";

export interface UseAIContextOptions {
	activeNoteId: string | null;
	activeNoteTitle: string | null;
	activeNoteMarkdown?: string | null;
	selectedCanvasNodes: SelectedCanvasNode[];
	canvasDoc: CanvasDocLike | null;
}

export interface UseAIContextResult {
	contextSpec: ContextSpec;
	includeActiveNote: boolean;
	setIncludeActiveNote: React.Dispatch<React.SetStateAction<boolean>>;
	includeSelectedNodes: boolean;
	setIncludeSelectedNodes: React.Dispatch<React.SetStateAction<boolean>>;
	includeNoteContents: boolean;
	setIncludeNoteContents: React.Dispatch<React.SetStateAction<boolean>>;
	includeLinkPreviewText: boolean;
	setIncludeLinkPreviewText: React.Dispatch<React.SetStateAction<boolean>>;
	neighborDepth: 0 | 1 | 2;
	setNeighborDepth: React.Dispatch<React.SetStateAction<0 | 1 | 2>>;
	charBudget: number;
	setCharBudget: React.Dispatch<React.SetStateAction<number>>;
	payloadPreview: string;
	payloadApproved: boolean;
	setPayloadApproved: React.Dispatch<React.SetStateAction<boolean>>;
	payloadManifest: ContextManifest | null;
	payloadError: string;
	buildPayload: () => Promise<void>;
	activeNoteDisk: { id: string; title: string; markdown: string } | null;
}

export function useAIContext(options: UseAIContextOptions): UseAIContextResult {
	const {
		activeNoteId,
		activeNoteTitle,
		activeNoteMarkdown,
		selectedCanvasNodes,
		canvasDoc,
	} = options;

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
		const noteKey = activeNoteId ? `${activeNoteId}` : "";
		const canvasKey = canvasDoc?.id ?? "";
		return JSON.stringify({ selectedIds, noteKey, canvasKey, contextSpec });
	}, [activeNoteId, canvasDoc?.id, contextSpec, selectedCanvasNodes]);

	useEffect(() => {
		void payloadInvalidationKey;
		setPayloadApproved(false);
		setPayloadError("");
	}, [payloadInvalidationKey]);

	const noteCacheRef = useRef<Map<string, { title: string; markdown: string }>>(
		new Map(),
	);
	const linkPreviewCacheRef = useRef<Map<string, LinkPreview>>(new Map());

	const getNote = useCallback(async (noteId: string) => {
		const cached = noteCacheRef.current.get(noteId);
		if (cached) return cached;
		const next = isUuid(noteId)
			? await (async () => {
					const doc = await invoke("note_read", { id: noteId });
					return { title: doc.meta.title, markdown: doc.markdown };
				})()
			: await (async () => {
					const doc = await invoke("vault_read_text", { path: noteId });
					const title = noteId.split("/").pop() || noteId;
					return { title, markdown: doc.text };
				})();
		noteCacheRef.current.set(noteId, next);
		return next;
	}, []);

	const getLinkPreview = useCallback(
		async (url: string): Promise<LinkPreview | null> => {
			const cached = linkPreviewCacheRef.current.get(url);
			if (cached) return cached;
			try {
				const preview = await invoke("link_preview", { url });
				linkPreviewCacheRef.current.set(url, preview);
				return preview;
			} catch {
				return null;
			}
		},
		[],
	);

	const [activeNoteDisk, setActiveNoteDisk] = useState<{
		id: string;
		title: string;
		markdown: string;
	} | null>(null);

	useEffect(() => {
		let cancelled = false;
		if (!activeNoteId) {
			setActiveNoteDisk(null);
			return;
		}
		(async () => {
			try {
				const fromProps =
					typeof activeNoteMarkdown === "string" && activeNoteMarkdown.length
						? {
								id: activeNoteId,
								title: activeNoteTitle || activeNoteId,
								markdown: activeNoteMarkdown,
							}
						: null;
				const note = fromProps ?? (await getNote(activeNoteId));
				if (cancelled) return;
				setActiveNoteDisk({
					id: activeNoteId,
					title: note.title || activeNoteTitle || activeNoteId,
					markdown: note.markdown,
				});
			} catch {
				if (!cancelled) setActiveNoteDisk(null);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [activeNoteId, activeNoteMarkdown, activeNoteTitle, getNote]);

	const buildPayload = useCallback(async () => {
		setPayloadError("");
		setPayloadApproved(false);

		try {
			const result = await buildContextPayload(
				{
					contextSpec,
					activeNoteId,
					activeNoteTitle,
					activeNoteMarkdown,
					selectedCanvasNodes,
					canvasDoc,
				},
				{ getNote, getLinkPreview },
			);
			setPayloadPreview(result.payload);
			setPayloadManifest(result.manifest);
		} catch (e) {
			setPayloadError(errMessage(e));
		}
	}, [
		activeNoteId,
		activeNoteMarkdown,
		activeNoteTitle,
		canvasDoc,
		contextSpec,
		getLinkPreview,
		getNote,
		selectedCanvasNodes,
	]);

	return {
		contextSpec,
		includeActiveNote,
		setIncludeActiveNote,
		includeSelectedNodes,
		setIncludeSelectedNodes,
		includeNoteContents,
		setIncludeNoteContents,
		includeLinkPreviewText,
		setIncludeLinkPreviewText,
		neighborDepth,
		setNeighborDepth,
		charBudget,
		setCharBudget,
		payloadPreview,
		payloadApproved,
		setPayloadApproved,
		payloadManifest,
		payloadError,
		buildPayload,
		activeNoteDisk,
	};
}
