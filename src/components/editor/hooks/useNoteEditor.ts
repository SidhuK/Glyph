import type { AnyExtension, JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { useEditor } from "@tiptap/react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";
import { useState } from "react";
import {
	DEFAULT_ATTACHMENT_FOLDER,
	resolveAttachmentTargetDir,
} from "../../../lib/attachmentStorage";
import {
	joinYamlFrontmatter,
	splitYamlFrontmatter,
} from "../../../lib/notePreview";
import {
	type AttachmentStorageMode,
	loadSettings,
} from "../../../lib/settings";
import { invoke } from "../../../lib/tauri";
import { useTauriEvent } from "../../../lib/tauriEvents";
import { handleEditorClick } from "../editorClickHandlers";
import { createEditorExtensions } from "../extensions";
import type { MathEditRequest } from "../extensions/math/mathOptions";
import { handleTagDecorationMouseDown } from "../extensions/tagDecorations";
import { looksLikeMarkdownPaste } from "../markdown/markdownPaste";
import {
	postprocessMarkdownFromEditor,
	preprocessMarkdownForEditor,
} from "../markdown/wikiLinkMarkdownBridge";
import type { NoteInlineEditorMode, PasteMarkdownBehavior } from "../types";
import { useHydrateInlineImages } from "./useHydrateInlineImages";

const PASTE_FAILURE_PREFIX = "Image paste failed";
const MARKDOWN_SYNC_DEBOUNCE_MS = 300;
const EMPTY_ADDITIONAL_EXTENSIONS: AnyExtension[] = [];

function normalizeBody(markdown: string): string {
	return markdown.replace(/\u00a0/g, " ").replace(/&nbsp;/g, " ");
}

function getClipboardHtml(event: ClipboardEvent): string {
	return event.clipboardData?.getData("text/html") ?? "";
}

function getClipboardPlainText(event: ClipboardEvent): string {
	return event.clipboardData?.getData("text/plain") ?? "";
}

function normalizeClipboardMarkdownText(text: string): string {
	return normalizeBody(text).replace(/\r\n?/g, "\n");
}

const HTML_BLOCK_TAGS = new Set([
	"ADDRESS",
	"ARTICLE",
	"ASIDE",
	"BLOCKQUOTE",
	"DETAILS",
	"DIV",
	"DL",
	"FIELDSET",
	"FIGCAPTION",
	"FIGURE",
	"FOOTER",
	"FORM",
	"H1",
	"H2",
	"H3",
	"H4",
	"H5",
	"H6",
	"HEADER",
	"HR",
	"LI",
	"MAIN",
	"NAV",
	"OL",
	"P",
	"PRE",
	"SECTION",
	"SUMMARY",
	"TABLE",
	"TD",
	"TH",
	"TR",
	"UL",
]);

function extractPlainTextFromClipboardHtml(html: string): string {
	if (!html.trim() || typeof DOMParser === "undefined") return "";
	const doc = new DOMParser().parseFromString(html, "text/html");
	const body = doc.body;
	if (!body) return "";

	let out = "";
	const appendNewline = () => {
		if (!out.endsWith("\n")) out += "\n";
	};

	const visit = (node: Node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			out += node.textContent ?? "";
			return;
		}
		if (!(node instanceof Element)) return;
		if (node.tagName === "BR") {
			appendNewline();
			return;
		}
		const isBlock = HTML_BLOCK_TAGS.has(node.tagName);
		if (isBlock && out && !out.endsWith("\n")) appendNewline();
		for (const child of Array.from(node.childNodes)) {
			visit(child);
		}
		if (isBlock) appendNewline();
	};

	for (const child of Array.from(body.childNodes)) {
		visit(child);
	}

	return normalizeClipboardMarkdownText(out).trim();
}

function getPastedImageFiles(event: ClipboardEvent): File[] {
	const files: File[] = [];
	for (const item of Array.from(event.clipboardData?.items ?? [])) {
		if (!item.type.startsWith("image/")) continue;
		const file = item.getAsFile();
		if (file) files.push(file);
	}
	return files;
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === "string") {
				resolve(reader.result);
				return;
			}
			reject(new Error("Failed to read pasted image."));
		};
		reader.onerror = () => {
			reject(reader.error ?? new Error("Failed to read pasted image."));
		};
		reader.readAsDataURL(file);
	});
}

function replacePlaceholderWithImage(
	editor: NonNullable<ReturnType<typeof useEditor>>,
	uploadId: string,
	nextAttrs: Record<string, unknown>,
): boolean {
	const tr = editor.state.tr;
	let changed = false;
	editor.state.doc.descendants((node, pos) => {
		if (node.type.name !== "image") return;
		if ((node.attrs.uploadId as string | null) !== uploadId) return;
		tr.setNodeMarkup(pos, undefined, {
			...node.attrs,
			...nextAttrs,
			uploadId: null,
		});
		changed = true;
	});
	if (!changed) return false;
	editor.view.dispatch(tr);
	return true;
}

function replacePlaceholderWithFallbackText(
	editor: NonNullable<ReturnType<typeof useEditor>>,
	uploadId: string,
	label: string,
): boolean {
	const tr = editor.state.tr;
	const paragraph = editor.state.schema.nodes.paragraph;
	const textNode = editor.state.schema.text;
	let changed = false;
	editor.state.doc.descendants((node, pos) => {
		if (changed || node.type.name !== "image") return;
		if ((node.attrs.uploadId as string | null) !== uploadId) return;
		const fallbackText = `[${PASTE_FAILURE_PREFIX}: ${label}]`;
		if (paragraph) {
			tr.replaceWith(
				pos,
				pos + node.nodeSize,
				paragraph.create(null, fallbackText ? textNode(fallbackText) : null),
			);
		} else {
			tr.delete(pos, pos + node.nodeSize);
		}
		changed = true;
	});
	if (!changed) return false;
	editor.view.dispatch(tr);
	return true;
}

function getInsertableMarkdownContent(
	markdownManager: MarkdownManager,
	text: string,
): JSONContent[] {
	const parsed = markdownManager.parse(preprocessMarkdownForEditor(text));
	const content = Array.isArray(parsed.content) ? parsed.content : [];
	if (content.length !== 1 || content[0]?.type !== "paragraph") {
		return content;
	}
	return Array.isArray(content[0].content) ? content[0].content : [];
}

function shouldHandleSmartMarkdownPaste(
	clipboardText: string,
	clipboardHtml: string,
): boolean {
	const normalizedText = normalizeClipboardMarkdownText(clipboardText).trim();
	if (!looksLikeMarkdownPaste(normalizedText)) return false;
	const normalizedHtml = extractPlainTextFromClipboardHtml(clipboardHtml);
	if (!normalizedHtml) return true;
	return normalizedHtml === normalizedText;
}

interface UseNoteEditorOptions {
	additionalExtensions?: AnyExtension[];
	markdown: string;
	mode: NoteInlineEditorMode;
	relPath?: string;
	interactive?: boolean;
	enableHydrateInlineImages?: boolean;
	enableMarkdownLinkAutocomplete?: boolean;
	pasteMarkdownBehavior?: PasteMarkdownBehavior;
	placeholder?: string;
	onChange: (nextMarkdown: string) => void;
	onMathEditRequest?: (request: MathEditRequest) => void;
}

interface PendingMarkdownSync {
	instance: NonNullable<ReturnType<typeof useEditor>>;
	frontmatter: string | null;
	lastEmittedMarkdown: string;
	onChange: (nextMarkdown: string) => void;
	relPath: string;
}

interface SelectionSnapshot {
	from: number;
	relPath: string;
	to: number;
}

function clampSelectionPosition(pos: number, docSize: number): number {
	return Math.min(Math.max(pos, 0), docSize);
}

function snapshotFocusedSelection(
	editor: NonNullable<ReturnType<typeof useEditor>> | null,
	relPath: string,
): SelectionSnapshot | null {
	if (!editor || editor.isDestroyed) return null;
	try {
		if (!editor.view.hasFocus()) return null;
		const { from, to } = editor.state.selection;
		return { from, relPath, to };
	} catch {
		return null;
	}
}

function restoreSelectionSnapshot(
	editor: NonNullable<ReturnType<typeof useEditor>>,
	snapshot: SelectionSnapshot,
	relPath: string,
): boolean {
	if (snapshot.relPath !== relPath) return false;
	const docSize = editor.state.doc.content.size;
	const from = clampSelectionPosition(snapshot.from, docSize);
	const to = clampSelectionPosition(snapshot.to, docSize);
	const range = from <= to ? { from, to } : { from: to, to: from };
	try {
		if (editor.commands.setTextSelection(range)) {
			editor.view.focus();
			return true;
		}
	} catch {
		// Fall back to a collapsed selection below.
	}
	try {
		if (editor.commands.setTextSelection(range.from)) {
			editor.view.focus();
			return true;
		}
	} catch {
		// If neither selection can be represented in the new document, leave the
		// editor unfocused instead of letting the browser choose an end position.
	}
	return false;
}

export function useNoteEditor({
	additionalExtensions = EMPTY_ADDITIONAL_EXTENSIONS,
	markdown,
	mode,
	relPath = "",
	interactive = true,
	enableHydrateInlineImages = true,
	enableMarkdownLinkAutocomplete = true,
	pasteMarkdownBehavior = "plain-text",
	placeholder = "Start writing or press / for commands",
	onChange,
	onMathEditRequest,
}: UseNoteEditorOptions) {
	const { frontmatter, editorBody } = useMemo(() => {
		if (mode === "plain") {
			return { frontmatter: null, editorBody: "" };
		}
		const split = splitYamlFrontmatter(markdown);
		return {
			...split,
			editorBody: preprocessMarkdownForEditor(split.body),
		};
	}, [markdown, mode]);

	const frontmatterRef = useRef(frontmatter);
	const lastAppliedBodyRef = useRef(editorBody);
	const lastEmittedMarkdownRef = useRef(markdown);
	const onChangeRef = useRef(onChange);
	const suppressUpdateRef = useRef(false);
	const relPathRef = useRef(relPath);
	const interactiveRef = useRef(interactive);
	const modeRef = useRef(mode);
	const previousModeRef = useRef(mode);
	const attachmentStorageModeRef = useRef<AttachmentStorageMode>("note-folder");
	const attachmentFolderRef = useRef<string | null>(DEFAULT_ATTACHMENT_FOLDER);
	const editorRef = useRef<ReturnType<typeof useEditor>>(null);
	const committedEditorRef = useRef<ReturnType<typeof useEditor>>(null);
	const pendingMarkdownSyncRef = useRef<PendingMarkdownSync | null>(null);
	const pendingSelectionRestoreRef = useRef<SelectionSnapshot | null>(null);
	const editorContentRelPathRef = useRef(relPath);
	const markdownSyncTimeoutRef = useRef<number | null>(null);
	const markdownSyncFrameRef = useRef<number | null>(null);
	const [showCollapsibleHeadings, setShowCollapsibleHeadings] = useState(false);
	const [showFrontmatterInEditor, setShowFrontmatterInEditor] = useState(false);
	const [colorfulHeadings, setColorfulHeadings] = useState(false);
	const [peopleMentionsEnabled, setPeopleMentionsEnabled] = useState(false);
	const [vimKeybindingsEnabled, setVimKeybindingsEnabled] = useState(false);
	const extensions = useMemo(
		() =>
			createEditorExtensions({
				additionalExtensions,
				currentPath: "",
				currentPathResolver: () => relPathRef.current,
				enableMarkdownLinkAutocomplete,
				enablePeopleMentions: peopleMentionsEnabled,
				enableVimKeybindings: vimKeybindingsEnabled,
				onMathEditRequest,
				placeholder,
			}),
		[
			additionalExtensions,
			enableMarkdownLinkAutocomplete,
			onMathEditRequest,
			peopleMentionsEnabled,
			placeholder,
			vimKeybindingsEnabled,
		],
	);
	const markdownManager = useMemo(
		() =>
			pasteMarkdownBehavior === "smart-markdown"
				? new MarkdownManager({
						extensions,
						markedOptions: {
							gfm: true,
							breaks: false,
						},
					})
				: null,
		[extensions, pasteMarkdownBehavior],
	);

	useEffect(() => {
		let cancelled = false;
		void loadSettings()
			.then((settings) => {
				if (cancelled) return;
				setShowCollapsibleHeadings(settings.editor.showCollapsibleHeadings);
				setShowFrontmatterInEditor(
					settings.editor.showFrontmatterInEditor === true,
				);
				setColorfulHeadings(settings.editor.colorfulHeadings);
				setPeopleMentionsEnabled(settings.editor.enablePeopleMentionsAsTags);
				setVimKeybindingsEnabled(settings.editor.vimKeybindings === true);
				attachmentStorageModeRef.current =
					settings.editor.attachmentStorageMode;
				attachmentFolderRef.current = settings.editor.attachmentFolder;
			})
			.catch(() => {
				if (cancelled) return;
				setShowCollapsibleHeadings(false);
				setShowFrontmatterInEditor(false);
				setColorfulHeadings(false);
				setPeopleMentionsEnabled(false);
				setVimKeybindingsEnabled(false);
				attachmentStorageModeRef.current = "note-folder";
				attachmentFolderRef.current = DEFAULT_ATTACHMENT_FOLDER;
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useTauriEvent("settings:updated", (payload) => {
		if (typeof payload.editor?.showCollapsibleHeadings === "boolean") {
			setShowCollapsibleHeadings(payload.editor.showCollapsibleHeadings);
		}
		if (typeof payload.editor?.showFrontmatterInEditor === "boolean") {
			setShowFrontmatterInEditor(payload.editor.showFrontmatterInEditor);
		}
		if (typeof payload.editor?.colorfulHeadings === "boolean") {
			setColorfulHeadings(payload.editor.colorfulHeadings);
		}
		if (typeof payload.editor?.enablePeopleMentionsAsTags === "boolean") {
			setPeopleMentionsEnabled(payload.editor.enablePeopleMentionsAsTags);
		}
		if (typeof payload.editor?.vimKeybindings === "boolean") {
			setVimKeybindingsEnabled(payload.editor.vimKeybindings);
		}
		if (payload.editor?.attachmentStorageMode) {
			attachmentStorageModeRef.current = payload.editor.attachmentStorageMode;
		}
		if ("attachmentFolder" in (payload.editor ?? {})) {
			attachmentFolderRef.current = payload.editor?.attachmentFolder ?? null;
		}
	});

	frontmatterRef.current = frontmatter;
	onChangeRef.current = onChange;
	relPathRef.current = relPath;
	interactiveRef.current = interactive;
	modeRef.current = mode;

	const clearScheduledMarkdownSync = useCallback(() => {
		if (markdownSyncTimeoutRef.current !== null) {
			window.clearTimeout(markdownSyncTimeoutRef.current);
			markdownSyncTimeoutRef.current = null;
		}
		if (markdownSyncFrameRef.current !== null) {
			window.cancelAnimationFrame(markdownSyncFrameRef.current);
			markdownSyncFrameRef.current = null;
		}
	}, []);

	const flushMarkdownSync = useCallback(
		(expectedRelPath?: string) => {
			clearScheduledMarkdownSync();
			const pending = pendingMarkdownSyncRef.current;
			pendingMarkdownSyncRef.current = null;
			if (!pending) {
				return;
			}
			if (
				expectedRelPath !== undefined &&
				pending.relPath !== expectedRelPath
			) {
				return;
			}
			const { instance } = pending;
			const nextBody = postprocessMarkdownFromEditor(instance.getMarkdown());
			const nextMarkdown = joinYamlFrontmatter(
				pending.frontmatter,
				normalizeBody(nextBody),
			);
			if (pending.relPath === relPathRef.current) {
				lastAppliedBodyRef.current = preprocessMarkdownForEditor(nextBody);
				lastEmittedMarkdownRef.current = nextMarkdown;
			}
			if (nextMarkdown === pending.lastEmittedMarkdown) return;
			pending.onChange(nextMarkdown);
		},
		[clearScheduledMarkdownSync],
	);

	const scheduleMarkdownSync = useCallback(
		(instance: NonNullable<ReturnType<typeof useEditor>>) => {
			pendingMarkdownSyncRef.current = {
				instance,
				frontmatter: frontmatterRef.current,
				lastEmittedMarkdown: lastEmittedMarkdownRef.current,
				onChange: onChangeRef.current,
				relPath: relPathRef.current,
			};
			clearScheduledMarkdownSync();
			markdownSyncTimeoutRef.current = window.setTimeout(() => {
				markdownSyncTimeoutRef.current = null;
				markdownSyncFrameRef.current = window.requestAnimationFrame(() => {
					markdownSyncFrameRef.current = null;
					flushMarkdownSync();
				});
			}, MARKDOWN_SYNC_DEBOUNCE_MS);
		},
		[clearScheduledMarkdownSync, flushMarkdownSync],
	);

	useLayoutEffect(() => {
		// These values mirror useEditor's recreation dependencies below. Flush
		// before TipTap destroys an instance so its debounced edits are retained.
		void additionalExtensions;
		void peopleMentionsEnabled;
		void enableMarkdownLinkAutocomplete;
		void placeholder;
		void vimKeybindingsEnabled;
		return () => {
			const snapshot = snapshotFocusedSelection(
				committedEditorRef.current,
				relPath,
			);
			if (snapshot) pendingSelectionRestoreRef.current = snapshot;
			flushMarkdownSync(relPath);
		};
	}, [
		flushMarkdownSync,
		relPath,
		additionalExtensions,
		peopleMentionsEnabled,
		enableMarkdownLinkAutocomplete,
		placeholder,
		vimKeybindingsEnabled,
	]);

	const pendingSync = pendingMarkdownSyncRef.current;
	const editorContent =
		pendingSync?.relPath === relPath
			? pendingSync.instance.getMarkdown()
			: editorBody;

	const editor = useEditor(
		{
			extensions,
			content: editorContent,
			contentType: "markdown",
			editorProps: {
				attributes: {
					class: "tiptapContentInline",
					spellcheck: "true",
				},
				handleDOMEvents: {
					mousedown: (_view, event): boolean => {
						if (!(event instanceof MouseEvent)) return false;
						return handleTagDecorationMouseDown(event);
					},
					click: (view, event): boolean => {
						if (!(event instanceof MouseEvent)) return false;
						return handleEditorClick(
							event,
							view,
							relPathRef.current,
							interactiveRef.current,
							modeRef.current === "rich",
						);
					},
					paste: (_view, event) => {
						if (!(event instanceof ClipboardEvent)) return false;
						const editorInstance = editorRef.current;
						if (!editorInstance) return false;
						if (modeRef.current !== "rich") return false;
						if (!editorInstance.isEditable) return false;
						const imageFiles = getPastedImageFiles(event);
						if (imageFiles.length) {
							if (!relPathRef.current) return false;
							const sourcePath = relPathRef.current;
							const targetDir = resolveAttachmentTargetDir(
								attachmentStorageModeRef.current,
								attachmentFolderRef.current,
								sourcePath,
							);
							const selectionRange = {
								from: editorInstance.state.selection.from,
								to: editorInstance.state.selection.to,
							};
							const placeholders = imageFiles.map((file, index) => ({
								file,
								uploadId: `paste-${Date.now()}-${index}-${crypto.randomUUID()}`,
								objectUrl: URL.createObjectURL(file),
							}));
							const placeholderNodes = placeholders.map((item) => ({
								type: "image",
								attrs: {
									src: item.objectUrl,
									alt: item.file.name || "",
									title: "",
									originSrc: "",
									uploadId: item.uploadId,
								},
							}));
							if (
								!editorInstance
									.can()
									.insertContentAt(selectionRange, placeholderNodes)
							) {
								for (const item of placeholders) {
									URL.revokeObjectURL(item.objectUrl);
								}
								return false;
							}
							const inserted = editorInstance
								.chain()
								.focus()
								.insertContentAt(selectionRange, placeholderNodes)
								.run();
							if (!inserted) {
								for (const item of placeholders) {
									URL.revokeObjectURL(item.objectUrl);
								}
								return false;
							}
							event.preventDefault();
							void (async () => {
								for (const item of placeholders) {
									try {
										const dataUrl = await readFileAsDataUrl(item.file);
										const saved = await invoke("space_save_pasted_image", {
											source_path: sourcePath,
											target_dir: targetDir,
											data_url: dataUrl,
											original_filename: item.file.name || null,
										});
										replacePlaceholderWithImage(editorInstance, item.uploadId, {
											src: dataUrl,
											alt: item.file.name || "",
											title: "",
											originSrc: saved.href,
										});
									} catch {
										replacePlaceholderWithFallbackText(
											editorInstance,
											item.uploadId,
											item.file.name || "image",
										);
									} finally {
										URL.revokeObjectURL(item.objectUrl);
									}
								}
							})();
							return true;
						}
						if (pasteMarkdownBehavior !== "smart-markdown") return false;
						if (editorInstance.isActive("codeBlock")) return false;
						const clipboardHtml = getClipboardHtml(event);
						const clipboardText = normalizeClipboardMarkdownText(
							getClipboardPlainText(event),
						);
						if (!shouldHandleSmartMarkdownPaste(clipboardText, clipboardHtml)) {
							return false;
						}
						const selectionRange = {
							from: editorInstance.state.selection.from,
							to: editorInstance.state.selection.to,
						};
						if (!markdownManager) return false;
						const insertableContent = getInsertableMarkdownContent(
							markdownManager,
							clipboardText,
						);
						if (!insertableContent.length) return false;
						if (
							!editorInstance
								.can()
								.insertContentAt(selectionRange, insertableContent)
						) {
							return false;
						}
						const inserted = editorInstance
							.chain()
							.focus()
							.insertContentAt(selectionRange, insertableContent)
							.run();
						if (!inserted) return false;
						event.preventDefault();
						return true;
					},
				},
			},
			onTransaction: ({ editor: instance, transaction }) => {
				if (!transaction.docChanged) return;
				if (suppressUpdateRef.current) {
					suppressUpdateRef.current = false;
					return;
				}
				if (modeRef.current !== "rich" || !instance.isEditable) return;
				scheduleMarkdownSync(instance);
			},
		},
		[
			additionalExtensions,
			peopleMentionsEnabled,
			enableMarkdownLinkAutocomplete,
			placeholder,
			vimKeybindingsEnabled,
		],
	);
	editorRef.current = editor;

	useLayoutEffect(() => {
		if (!editor) return;
		const snapshot = pendingSelectionRestoreRef.current;
		if (!snapshot) return;
		pendingSelectionRestoreRef.current = null;
		restoreSelectionSnapshot(editor, snapshot, relPath);
	}, [editor, relPath]);

	useLayoutEffect(() => {
		committedEditorRef.current = editor;
	}, [editor]);

	useEffect(() => {
		if (!editor) return;
		editor.setEditable(mode === "rich");
	}, [editor, mode]);

	useEffect(() => {
		if (!editor) return;
		editor.commands.setHeadingCollapseEnabled(showCollapsibleHeadings);
	}, [editor, showCollapsibleHeadings]);

	useEffect(() => {
		if (!editor) return;
		const previousMode = previousModeRef.current;
		previousModeRef.current = mode;
		if (mode === "plain") return;
		const isHydratingFromPlainMode = previousMode === "plain";
		if (
			!isHydratingFromPlainMode &&
			markdown === lastEmittedMarkdownRef.current
		) {
			return;
		}
		if (editorBody === lastAppliedBodyRef.current) return;
		flushMarkdownSync(relPath);
		suppressUpdateRef.current = true;
		const snapshot = snapshotFocusedSelection(
			editor,
			editorContentRelPathRef.current,
		);
		editor.commands.setContent(editorBody, { contentType: "markdown" });
		if (snapshot) restoreSelectionSnapshot(editor, snapshot, relPath);
		editorContentRelPathRef.current = relPath;
		lastAppliedBodyRef.current = editorBody;
		lastEmittedMarkdownRef.current = markdown;
	}, [editor, editorBody, flushMarkdownSync, markdown, mode, relPath]);

	useEffect(() => {
		return () => {
			flushMarkdownSync();
		};
	}, [flushMarkdownSync]);

	useHydrateInlineImages(editor, enableHydrateInlineImages ? relPath : "");

	return {
		editor,
		frontmatter,
		colorfulHeadings,
		showFrontmatterInEditor,
		frontmatterRef,
		lastAppliedBodyRef,
		lastEmittedMarkdownRef,
	};
}
