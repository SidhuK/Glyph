import { useCallback, useEffect, useRef, useState } from "react";
import { parseNotePreview } from "../../../lib/notePreview";
import { invoke } from "../../../lib/tauri";
import type { CanvasInlineEditorMode } from "../../editor";
import { isNoteNode } from "../types";
import type { CanvasNode, CanvasNoteEditSession, NoteTab } from "../types";
import { withUpdatedNoteNodeData } from "./noteEditHelpers";

export function useNoteEditSession(
	setNodes: React.Dispatch<React.SetStateAction<CanvasNode[]>>,
) {
	const noteEditLoadSeqRef = useRef(0);
	const noteEditSessionRef = useRef<CanvasNoteEditSession | null>(null);
	const [noteEditSession, setNoteEditSession] =
		useState<CanvasNoteEditSession | null>(null);
	const [noteTabs, setNoteTabs] = useState<NoteTab[]>([]);
	const [activeTabId, setActiveTabId] = useState<string | null>(null);
	const noteTabsRef = useRef<NoteTab[]>([]);
	const activeTabIdRef = useRef<string | null>(null);

	useEffect(() => {
		noteTabsRef.current = noteTabs;
	}, [noteTabs]);
	useEffect(() => {
		activeTabIdRef.current = activeTabId;
	}, [activeTabId]);
	useEffect(() => {
		noteEditSessionRef.current = noteEditSession;
	}, [noteEditSession]);

	const updateTabTitle = useCallback((noteId: string, title: string) => {
		setNoteTabs((prev) =>
			prev.map((tab) => (tab.noteId === noteId ? { ...tab, title } : tab)),
		);
	}, []);

	const ensureTabForNote = useCallback((noteId: string, title: string) => {
		setNoteTabs((prev) => {
			const existing = prev.find((tab) => tab.noteId === noteId);
			if (existing) {
				setActiveTabId(existing.tabId);
				return prev;
			}
			if (!prev.length) {
				const tabId = crypto.randomUUID();
				setActiveTabId(tabId);
				return [{ tabId, noteId, title }];
			}
			const activeId = activeTabIdRef.current;
			const activeIndex = prev.findIndex((t) => t.tabId === activeId);
			if (activeIndex === -1) {
				const tabId = crypto.randomUUID();
				setActiveTabId(tabId);
				return [...prev, { tabId, noteId, title }];
			}
			const active = prev[activeIndex];
			const next = [...prev];
			next[activeIndex] = { ...active, noteId, title };
			setActiveTabId(next[activeIndex].tabId);
			return next;
		});
	}, []);

	const createNewTab = useCallback(() => {
		const tabId = crypto.randomUUID();
		setNoteTabs((prev) => [...prev, { tabId, noteId: null, title: "New tab" }]);
		setActiveTabId(tabId);
	}, []);

	const saveInlineNote = useCallback(
		async (markdown: string, opts?: { forceOverwrite?: boolean }) => {
			const s = noteEditSessionRef.current;
			if (!s) return;
			if (!opts?.forceOverwrite && s.baseMtimeMs == null) {
				setNoteEditSession((prev) => {
					if (!prev || prev.noteId !== s.noteId) return prev;
					return {
						...prev,
						phase: "error",
						errorMessage: "Note not loaded yet; refusing to save.",
					};
				});
				return;
			}
			setNoteEditSession((prev) => {
				if (!prev || prev.noteId !== s.noteId) return prev;
				return { ...prev, phase: "saving", errorMessage: "" };
			});

			try {
				const res = await invoke("vault_write_text", {
					path: s.noteId,
					text: markdown,
					base_mtime_ms: opts?.forceOverwrite ? null : s.baseMtimeMs,
				});
				const preview = parseNotePreview(s.noteId, markdown);
				updateTabTitle(s.noteId, preview.title);
				setNodes((prev) =>
					withUpdatedNoteNodeData(
						prev,
						s.nodeId,
						s.noteId,
						preview,
						res.mtime_ms,
					),
				);
				setNoteEditSession((prev) => {
					if (!prev || prev.noteId !== s.noteId) return prev;
					return {
						...prev,
						phase: "ready",
						dirty: false,
						errorMessage: "",
						baseMtimeMs: res.mtime_ms,
						lastSavedMarkdown: markdown,
					};
				});
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				const isConflict = message.toLowerCase().includes("conflict:");
				setNoteEditSession((prev) => {
					if (!prev || prev.noteId !== s.noteId) return prev;
					return {
						...prev,
						phase: isConflict ? "conflict" : "error",
						errorMessage: message,
						dirty: true,
					};
				});
			}
		},
		[setNodes, updateTabTitle],
	);

	const confirmDiscardBeforeProceed = useCallback(
		async (purpose: "close" | "switch") => {
			const s = noteEditSessionRef.current;
			if (!s || !s.dirty) return { ok: true as const };
			const message =
				purpose === "close"
					? "Discard unsaved changes and close the editor?"
					: "Discard unsaved changes and switch notes?";
			const discard = window.confirm(message);
			if (!discard) return { ok: false as const };
			setNoteEditSession((prev) => {
				if (!prev || prev.noteId !== s.noteId) return prev;
				return {
					...prev,
					dirty: false,
					errorMessage: "",
					phase: prev.phase === "loading" ? "loading" : "ready",
					markdown: prev.lastSavedMarkdown,
				};
			});
			return { ok: true as const };
		},
		[],
	);

	const beginInlineEdit = useCallback(
		async (node: CanvasNode): Promise<boolean> => {
			const noteId = isNoteNode(node) ? node.data.noteId : node.id;
			if (!noteId) return false;

			const current = noteEditSessionRef.current;
			if (current?.noteId === noteId) return true;

			if (current?.dirty) {
				const ok = await confirmDiscardBeforeProceed("switch");
				if (!ok.ok) return false;
			}

			const seq = ++noteEditLoadSeqRef.current;
			setNoteEditSession({
				nodeId: node.id,
				noteId,
				phase: "loading",
				markdown: "",
				baseMtimeMs: null,
				dirty: false,
				lastSavedMarkdown: "",
				mode: "rich",
				errorMessage: "",
			});
			try {
				const doc = await invoke("vault_read_text", { path: noteId });
				if (seq !== noteEditLoadSeqRef.current) return false;
				const preview = parseNotePreview(noteId, doc.text);
				updateTabTitle(noteId, preview.title);
				setNodes((prev) =>
					withUpdatedNoteNodeData(prev, node.id, noteId, preview, doc.mtime_ms),
				);
				setNoteEditSession((prev) => {
					if (!prev || prev.noteId !== noteId) return prev;
					return {
						...prev,
						phase: "ready",
						markdown: doc.text,
						baseMtimeMs: doc.mtime_ms,
						dirty: false,
						lastSavedMarkdown: doc.text,
						mode: "rich",
						errorMessage: "",
					};
				});
				return true;
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				setNoteEditSession((prev) => {
					if (!prev || prev.noteId !== noteId) return prev;
					return { ...prev, phase: "error", errorMessage: message };
				});
				return false;
			}
		},
		[confirmDiscardBeforeProceed, setNodes, updateTabTitle],
	);

	const updateInlineMarkdown = useCallback((nextMarkdown: string) => {
		const s = noteEditSessionRef.current;
		if (!s || s.phase === "loading") return;
		setNoteEditSession((prev) => {
			if (!prev || prev.noteId !== s.noteId) return prev;
			return {
				...prev,
				markdown: nextMarkdown,
				dirty: true,
				errorMessage:
					prev.phase === "error" || prev.phase === "conflict"
						? prev.errorMessage
						: "",
				phase:
					prev.phase === "error" || prev.phase === "conflict"
						? prev.phase
						: "ready",
			};
		});
	}, []);

	const setInlineEditorMode = useCallback((mode: CanvasInlineEditorMode) => {
		const s = noteEditSessionRef.current;
		if (!s) return;
		setNoteEditSession((prev) => {
			if (!prev || prev.noteId !== s.noteId) return prev;
			return { ...prev, mode };
		});
	}, []);

	const closeInlineEditor = useCallback(async () => {
		const s = noteEditSessionRef.current;
		if (!s) return;
		const res = await confirmDiscardBeforeProceed("close");
		if (!res.ok) return;
		setNoteEditSession(null);
	}, [confirmDiscardBeforeProceed]);

	const reloadInlineFromDisk = useCallback(async () => {
		const s = noteEditSessionRef.current;
		if (!s) return;
		setNoteEditSession((prev) => {
			if (!prev || prev.noteId !== s.noteId) return prev;
			return { ...prev, phase: "loading", errorMessage: "" };
		});
		try {
			const doc = await invoke("vault_read_text", { path: s.noteId });
			const preview = parseNotePreview(s.noteId, doc.text);
			updateTabTitle(s.noteId, preview.title);
			setNodes((prev) =>
				withUpdatedNoteNodeData(prev, s.nodeId, s.noteId, preview),
			);
			setNoteEditSession((prev) => {
				if (!prev || prev.noteId !== s.noteId) return prev;
				return {
					...prev,
					phase: "ready",
					markdown: doc.text,
					baseMtimeMs: doc.mtime_ms,
					dirty: false,
					lastSavedMarkdown: doc.text,
					errorMessage: "",
				};
			});
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			setNoteEditSession((prev) => {
				if (!prev || prev.noteId !== s.noteId) return prev;
				return { ...prev, phase: "error", errorMessage: message };
			});
		}
	}, [setNodes, updateTabTitle]);

	const overwriteInlineToDisk = useCallback(async () => {
		const s = noteEditSessionRef.current;
		if (!s) return;
		await saveInlineNote(s.markdown, { forceOverwrite: true });
	}, [saveInlineNote]);

	const saveInlineNow = useCallback(() => {
		const s = noteEditSessionRef.current;
		if (!s) return;
		void saveInlineNote(s.markdown);
	}, [saveInlineNote]);

	return {
		noteEditSession,
		noteTabs,
		activeTabId,
		setActiveTabId,
		setNoteTabs,
		ensureTabForNote,
		createNewTab,
		beginInlineEdit,
		updateInlineMarkdown,
		setInlineEditorMode,
		closeInlineEditor,
		reloadInlineFromDisk,
		overwriteInlineToDisk,
		saveInlineNow,
		confirmDiscardBeforeProceed,
		noteEditSessionRef,
		updateTabTitle,
	};
}
