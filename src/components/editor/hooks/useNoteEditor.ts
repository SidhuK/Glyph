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
import { resolveAttachmentTargetDir } from "../../../lib/attachmentStorage";
import {
	joinYamlFrontmatter,
	splitYamlFrontmatter,
} from "../../../lib/notePreview";
import { invoke } from "../../../lib/tauri";
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
import {
	applyEditorSpellCheck,
	useEditorSpellCheck,
} from "./useEditorSpellCheck";
import { useHydrateInlineImages } from "./useHydrateInlineImages";
import { useNoteEditorSettings } from "./useNoteEditorSettings";

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
	if (editor.isDestroyed) return false;
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
	const {
		attachmentFolderRef,
		attachmentStorageModeRef,
		colorfulHeadings,
		peopleMentionsEnabled,
		showCollapsibleHeadings,
		showFrontmatterInEditor,
	} = useNoteEditorSettings();
	const spellCheckEnabled = useEditorSpellCheck();
	const editorRef = useRef<ReturnType<typeof useEditor>>(null);
	const committedEditorRef = useRef<ReturnType<typeof useEditor>>(null);
	const pendingMarkdownSyncRef = useRef<PendingMarkdownSync | null>(null);
	const pendingSelectionRestoreRef = useRef<SelectionSnapshot | null>(null);
	const editorContentRelPathRef = useRef(relPath);
	const markdownSyncTimeoutRef = useRef<number | null>(null);
	const markdownSyncFrameRef = useRef<number | null>(null);
	const markdownManagerRef = useRef<MarkdownManager | null>(null);
	const pasteMarkdownBehaviorRef = useRef(pasteMarkdownBehavior);
	const extensions = useMemo(
		() =>
			createEditorExtensions({
				additionalExtensions,
				currentPath: "",
				currentPathResolver: () => relPathRef.current,
				enableMarkdownLinkAutocomplete,
				enablePeopleMentions: peopleMentionsEnabled,
				onMathEditRequest,
				placeholder,
			}),
		[
			additionalExtensions,
			enableMarkdownLinkAutocomplete,
			onMathEditRequest,
			peopleMentionsEnabled,
			placeholder,
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

	frontmatterRef.current = frontmatter;
	markdownManagerRef.current = markdownManager;
	onChangeRef.current = onChange;
	pasteMarkdownBehaviorRef.current = pasteMarkdownBehavior;
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
			if (instance.isDestroyed) return;
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
	]);

	const pendingSync = pendingMarkdownSyncRef.current;
	const editorContent =
		pendingSync?.relPath === relPath && !pendingSync.instance.isDestroyed
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
									if (
										editorInstance.isDestroyed ||
										editorRef.current !== editorInstance ||
										sourcePath !== relPathRef.current
									) {
										URL.revokeObjectURL(item.objectUrl);
										continue;
									}
									try {
										const dataUrl = await readFileAsDataUrl(item.file);
										const saved = await invoke("space_save_pasted_image", {
											source_path: sourcePath,
											target_dir: targetDir,
											data_url: dataUrl,
											original_filename: item.file.name || null,
										});
										if (
											editorInstance.isDestroyed ||
											editorRef.current !== editorInstance ||
											sourcePath !== relPathRef.current
										) {
											continue;
										}
										replacePlaceholderWithImage(editorInstance, item.uploadId, {
											src: dataUrl,
											alt: item.file.name || "",
											title: "",
											originSrc: saved.href,
										});
									} catch {
										if (
											editorInstance.isDestroyed ||
											editorRef.current !== editorInstance ||
											sourcePath !== relPathRef.current
										) {
											continue;
										}
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
						if (pasteMarkdownBehaviorRef.current !== "smart-markdown") {
							return false;
						}
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
						const activeMarkdownManager = markdownManagerRef.current;
						if (!activeMarkdownManager) return false;
						const insertableContent = getInsertableMarkdownContent(
							activeMarkdownManager,
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
		],
	);
	editorRef.current = editor;

	useEffect(() => {
		if (editor?.isDestroyed) return;
		applyEditorSpellCheck(editor, spellCheckEnabled);
	}, [editor, spellCheckEnabled]);

	useLayoutEffect(() => {
		if (!editor || editor.isDestroyed) return;
		const snapshot = pendingSelectionRestoreRef.current;
		if (!snapshot) return;
		pendingSelectionRestoreRef.current = null;
		restoreSelectionSnapshot(editor, snapshot, relPath);
	}, [editor, relPath]);

	useLayoutEffect(() => {
		committedEditorRef.current = editor;
	}, [editor]);

	useEffect(() => {
		if (!editor || editor.isDestroyed) return;
		editor.setEditable(mode === "rich");
	}, [editor, mode]);

	useEffect(() => {
		if (!editor || editor.isDestroyed) return;
		editor.commands.setHeadingCollapseEnabled(showCollapsibleHeadings);
	}, [editor, showCollapsibleHeadings]);

	useEffect(() => {
		if (!editor || editor.isDestroyed) return;
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
