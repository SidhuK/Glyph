import { openUrl } from "@tauri-apps/plugin-opener";
import type { AnyExtension, Editor, JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { Selection } from "@tiptap/pm/state";
import { AnimatePresence } from "motion/react";
import {
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	Suspense,
	lazy,
	memo,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { isHtmlEmbedCodeBlockLanguage } from "../../lib/htmlEmbed";
import { isMermaidCodeBlockLanguage } from "../../lib/mermaid";
import { joinYamlFrontmatter } from "../../lib/notePreview";
import { toast } from "../../lib/toast";
import { dispatchAiContextAttach } from "../ai/aiContextEvents";
import { EditorRibbon } from "./EditorRibbon";
import { ExtractToNoteDialog } from "./ExtractToNoteDialog";
import {
	type FocusedCodeBlockPreview,
	FocusedCodeBlockPreviewDialog,
} from "./FocusedCodeBlockPreviewDialog";
import { NoteEditorSurface } from "./NoteEditorSurface";
import { NoteFindBar } from "./NoteFindBar";
import { NoteLinkDialog, type NoteLinkDialogState } from "./NoteLinkDialog";
import { NotePropertiesPanel } from "./NotePropertiesPanel";
import {
	type SupportedCodeBlockLanguage,
	normalizeCodeBlockLanguage,
} from "./extensions/codeBlockHighlighting";
import {
	CODE_BLOCK_PREVIEW_REFRESH_META,
	type FocusedCodeBlockPreviewRequest,
	OPEN_FOCUSED_CODE_BLOCK_PREVIEW,
	clearCodeBlockPreviews,
	enableCodeBlockPreviewAt,
} from "./extensions/codeBlockPreviewPlugin";
import {
	getMountedEditorContentRoot,
	getOffsetWithinAncestor,
} from "./hooks/editorDomUtils";
import { useExtractSelectionToNote } from "./hooks/useExtractSelectionToNote";
import { useMathNodeEditor } from "./hooks/useMathNodeEditor";
import { useNoteEditor } from "./hooks/useNoteEditor";
import { useNoteFind } from "./hooks/useNoteFind";
import { useResetScrollOnChange } from "./hooks/useResetScrollOnChange";
import { useRibbonCommands } from "./hooks/useRibbonCommands";
import { useTableInlineControls } from "./hooks/useTableInlineControls";
import {
	dispatchInternalAnchorClick,
	dispatchMarkdownLinkClick,
	dispatchWikiLinkClick,
} from "./markdown/editorEvents";
import { parseWikiLink } from "./markdown/wikiLinkCodec";
import { preprocessMarkdownForEditor } from "./markdown/wikiLinkMarkdownBridge";
import { loadMathExtensionFactory } from "./math/loadMathExtensions";
import type { SelectedCodeBlockState } from "./noteEditorOverlayTypes";
import type { RawMarkdownEditorHandle } from "./raw/types";
import type { NoteInlineEditorProps } from "./types";

const EMPTY_ADDITIONAL_EXTENSIONS: AnyExtension[] = [];

const RawMarkdownEditor = lazy(() =>
	import("./raw/RawMarkdownEditor").then((module) => ({
		default: module.RawMarkdownEditor,
	})),
);

const MathNodeEditor = lazy(() =>
	import("./math/MathNodeEditor").then((module) => ({
		default: module.MathNodeEditor,
	})),
);

function normalizeBody(markdown: string): string {
	return markdown.replace(/\u00a0/g, " ").replace(/&nbsp;/g, " ");
}

function parseAiResponse(
	editor: Editor,
	markdown: string,
	unwrapSingleParagraph: boolean,
): JSONContent[] {
	const manager = new MarkdownManager({
		extensions: editor.extensionManager.extensions,
		markedOptions: {
			gfm: true,
			breaks: false,
		},
	});
	const parsed = manager.parse(preprocessMarkdownForEditor(markdown));
	const content = Array.isArray(parsed.content) ? parsed.content : [];
	if (
		unwrapSingleParagraph &&
		content.length === 1 &&
		content[0]?.type === "paragraph"
	) {
		return Array.isArray(content[0].content) ? content[0].content : [];
	}
	return content;
}

function isPreviewableCodeBlockLanguage(language: string | null): boolean {
	return (
		isHtmlEmbedCodeBlockLanguage(language) !== null ||
		isMermaidCodeBlockLanguage(language)
	);
}

function isFocusedCodeBlockPreviewRequest(
	value: unknown,
): value is FocusedCodeBlockPreviewRequest {
	if (
		!value ||
		typeof value !== "object" ||
		!("pos" in value) ||
		!("source" in value) ||
		!("language" in value)
	) {
		return false;
	}
	return (
		typeof value.pos === "number" &&
		typeof value.source === "string" &&
		(value.language === null || typeof value.language === "string")
	);
}

type FrontmatterLinkToken =
	| { kind: "wiki"; raw: string; start: number; end: number }
	| { kind: "href"; raw: string; href: string; start: number; end: number };

const FRONTMATTER_LINK_PATTERN =
	/!?\[\[[^\]\n]+\]\]|\[[^\]\n]+\]\((?:\\.|[^)\n])+\)|https?:\/\/[^\s<>"')\]]+/g;

function areSelectedCodeBlocksEqual(
	a: SelectedCodeBlockState | null,
	b: SelectedCodeBlockState | null,
): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	return (
		a.top === b.top &&
		a.controlsLeft === b.controlsLeft &&
		a.controlsRight === b.controlsRight &&
		a.pos === b.pos &&
		a.language === b.language &&
		a.source === b.source
	);
}

function areSelectedCodeBlocksSameBlock(
	a: SelectedCodeBlockState | null,
	b: SelectedCodeBlockState | null,
): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	return a.pos === b.pos && a.language === b.language && a.source === b.source;
}

function markdownHrefFromToken(raw: string): string | null {
	const match = raw.match(/^\[[^\]\n]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
	return match?.[1] ?? null;
}

function extractFrontmatterLinkTokens(text: string): FrontmatterLinkToken[] {
	const tokens: FrontmatterLinkToken[] = [];
	for (const match of text.matchAll(FRONTMATTER_LINK_PATTERN)) {
		if (match.index === undefined) continue;
		const raw = match[0];
		const start = match.index;
		const end = start + raw.length;
		if (raw.includes("[[")) {
			if (parseWikiLink(raw)) tokens.push({ kind: "wiki", raw, start, end });
			continue;
		}
		if (raw.startsWith("[")) {
			const href = markdownHrefFromToken(raw);
			if (href) tokens.push({ kind: "href", raw, href, start, end });
			continue;
		}
		tokens.push({ kind: "href", raw, href: raw, start, end });
	}
	return tokens;
}

async function openFrontmatterHref(
	href: string,
	sourcePath: string,
): Promise<void> {
	if (href.startsWith("http://") || href.startsWith("https://")) {
		await openUrl(href);
		return;
	}
	if (href.startsWith("#")) {
		dispatchInternalAnchorClick({ anchor: href, sourcePath });
		return;
	}
	dispatchMarkdownLinkClick({ href, sourcePath });
}

export const NoteInlineEditor = memo(function NoteInlineEditor({
	markdown,
	relPath,
	mode,
	interactive = true,
	deferHeavyFeatures = false,
	chrome = "full",
	additionalExtensions: additionalExtensionsProp = EMPTY_ADDITIONAL_EXTENSIONS,
	placeholder,
	pasteMarkdownBehavior = "plain-text",
	enableFocusMode = false,
	aiEnabled = false,
	onOpenAiPanel,
	onRegisterCalloutInserter,
	onEditorReady,
	onRawEditorReady,
	onFlushPendingEditsReady,
	onChange,
	onFrontmatterCommit,
	extractToNoteActions,
	rolloverTaskActions,
}: NoteInlineEditorProps) {
	const { t } = useTranslation("editor");
	const chromeMinimal = chrome === "minimal";
	const mathNodeEditor = useMathNodeEditor();
	const [mathExtensions, setMathExtensions] = useState<
		import("@tiptap/core").AnyExtension[]
	>([]);
	const [mathExtensionsReady, setMathExtensionsReady] = useState(
		mode === "plain",
	);
	useEffect(() => {
		if (chromeMinimal || mode === "plain" || mathExtensions.length > 0) {
			setMathExtensionsReady(true);
			return;
		}
		let cancelled = false;
		setMathExtensionsReady(false);
		void loadMathExtensionFactory()
			.then((createExtensions) => {
				if (cancelled) return;
				setMathExtensions(
					createExtensions({ onEditRequest: mathNodeEditor.open }),
				);
				setMathExtensionsReady(true);
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				console.error("Failed to load equation support.", error);
				setMathExtensionsReady(true);
			});
		return () => {
			cancelled = true;
		};
	}, [chromeMinimal, mathExtensions.length, mathNodeEditor.open, mode]);

	const mergedAdditionalExtensions = useMemo(
		() => [...mathExtensions, ...additionalExtensionsProp],
		[additionalExtensionsProp, mathExtensions],
	);

	const {
		editor,
		flushMarkdownSync,
		frontmatter,
		frontmatterRef,
		lastAppliedBodyRef,
		lastEmittedMarkdownRef,
		colorfulHeadings,
		showFrontmatterInEditor,
		showHeadingPrefixes,
	} = useNoteEditor({
		additionalExtensions: mergedAdditionalExtensions,
		markdown,
		mode,
		relPath,
		interactive,
		enableFocusMode,
		enableHydrateInlineImages: !deferHeavyFeatures,
		enableMarkdownLinkAutocomplete: !deferHeavyFeatures,
		pasteMarkdownBehavior,
		placeholder,
		onChange,
		onMathEditRequest: mathNodeEditor.open,
	});
	const liveEditor = editor && !editor.isDestroyed ? editor : null;
	mathNodeEditor.connect(liveEditor, mode === "rich" && !chromeMinimal);

	const canEdit = mode === "rich" && Boolean(liveEditor?.isEditable);
	const showEditorChrome = canEdit && !chromeMinimal;
	const [frontmatterDraft, setFrontmatterDraft] = useState(frontmatter ?? "");
	const lastFrontmatterRef = useRef(frontmatter);
	const tiptapHostRef = useRef<HTMLDivElement | null>(null);
	const noteEditorHostRef = useRef<HTMLDivElement | null>(null);
	const [tiptapHostNode, setTiptapHostNode] = useState<HTMLDivElement | null>(
		null,
	);
	const [selectedCodeBlock, setSelectedCodeBlock] =
		useState<SelectedCodeBlockState | null>(null);
	const selectedCodeBlockRef = useRef<SelectedCodeBlockState | null>(null);
	const codeBlockCopyResetTimerRef = useRef<number | null>(null);
	const [codeBlockCopied, setCodeBlockCopied] = useState(false);
	const [focusedCodeBlockPreview, setFocusedCodeBlockPreview] =
		useState<FocusedCodeBlockPreview | null>(null);
	const [linkDialog, setLinkDialog] = useState<NoteLinkDialogState | null>(
		null,
	);
	useEffect(() => {
		if (!onFlushPendingEditsReady) return;
		onFlushPendingEditsReady(() => flushMarkdownSync());
		return () => onFlushPendingEditsReady(null);
	}, [flushMarkdownSync, onFlushPendingEditsReady]);

	const rawEditorRef = useRef<RawMarkdownEditorHandle | null>(null);
	const handleRawEditorRef = useCallback(
		(editor: RawMarkdownEditorHandle | null) => {
			rawEditorRef.current = editor;
			onRawEditorReady?.(editor);
		},
		[onRawEditorReady],
	);
	const previousRelPathRef = useRef(relPath);
	useLayoutEffect(() => {
		// Mode and document identity define the lifetime of an edit request.
		void mode;
		void relPath;
		mathNodeEditor.close();
	}, [mathNodeEditor.close, mode, relPath]);

	useEffect(() => {
		const host = tiptapHostRef.current;
		const blurHostSelection = (host: HTMLDivElement | null) => {
			if (!host) return;
			const activeElement = document.activeElement;
			if (
				activeElement instanceof HTMLElement &&
				host.contains(activeElement)
			) {
				activeElement.blur();
			}
			const selection = window.getSelection();
			if (selection?.anchorNode && host.contains(selection.anchorNode)) {
				selection.removeAllRanges();
			}
		};
		if (previousRelPathRef.current !== relPath) {
			setFocusedCodeBlockPreview(null);
			if (editor && !editor.isDestroyed) {
				clearCodeBlockPreviews(editor.view);
				editor.view.dispatch(
					editor.state.tr.setMeta(CODE_BLOCK_PREVIEW_REFRESH_META, true),
				);
			}
			blurHostSelection(host);
			previousRelPathRef.current = relPath;
		}
		return () => {
			setFocusedCodeBlockPreview(null);
			blurHostSelection(host);
			if (editor && !editor.isDestroyed) {
				clearCodeBlockPreviews(editor.view);
			}
		};
	}, [editor, relPath]);

	useEffect(() => {
		if (!editor || editor.isDestroyed || mode !== "rich" || !tiptapHostNode) {
			setFocusedCodeBlockPreview(null);
			return;
		}
		const openFocusedPreview = (event: Event) => {
			if (!(event instanceof CustomEvent)) return;
			const request: unknown = event.detail;
			if (!isFocusedCodeBlockPreviewRequest(request)) return;
			if (!isPreviewableCodeBlockLanguage(request.language)) return;
			setFocusedCodeBlockPreview(request);
		};
		tiptapHostNode.addEventListener(
			OPEN_FOCUSED_CODE_BLOCK_PREVIEW,
			openFocusedPreview,
		);
		return () =>
			tiptapHostNode.removeEventListener(
				OPEN_FOCUSED_CODE_BLOCK_PREVIEW,
				openFocusedPreview,
			);
	}, [editor, mode, tiptapHostNode]);

	useEffect(() => {
		if (!focusedCodeBlockPreview || !editor || editor.isDestroyed) return;
		const closeOnSourceChange = () => setFocusedCodeBlockPreview(null);
		editor.on("update", closeOnSourceChange);
		return () => {
			editor.off("update", closeOnSourceChange);
		};
	}, [editor, focusedCodeBlockPreview]);

	useEffect(() => {
		if (frontmatter === lastFrontmatterRef.current) return;
		lastFrontmatterRef.current = frontmatter;
		setFrontmatterDraft(frontmatter ?? "");
	}, [frontmatter]);

	// Reset when the editor context changes, but not on every content update.
	// Including `markdown` here causes the viewport to jump to the top while typing.
	useResetScrollOnChange(tiptapHostRef, ".rfNodeNoteEditorBody", [
		mode,
		relPath,
	]);

	const tableControls = useTableInlineControls({
		canEdit: showEditorChrome,
		editor: liveEditor,
		hostRef: tiptapHostRef,
		mode,
	});
	const extractToNote = useExtractSelectionToNote({
		actions: extractToNoteActions,
		canEdit: showEditorChrome,
		editor: liveEditor,
		hostRef: tiptapHostRef,
		relPath,
	});
	const noteFind = useNoteFind({
		editor: liveEditor,
		markdown,
		mode,
		relPath,
		hostRef: noteEditorHostRef,
		rawEditorRef,
		tiptapHostRef,
	});

	useRibbonCommands({
		editor: liveEditor,
		canEdit: showEditorChrome,
		mode,
		tiptapHostRef,
		tiptapHostNode,
		onOpenLinkDialog: useCallback(
			(href: string, target: "_self" | "_blank") => {
				const selection = liveEditor?.state.selection;
				if (!selection) return;
				setLinkDialog({
					href,
					range: { from: selection.from, to: selection.to },
					target,
				});
			},
			[liveEditor],
		),
		onSendSelectionToAi: useCallback(() => {
			if (
				!aiEnabled ||
				!onOpenAiPanel ||
				!liveEditor ||
				liveEditor.isDestroyed ||
				!liveEditor.isEditable
			) {
				return;
			}
			const { from, to, empty } = liveEditor.state.selection;
			if (empty) {
				toast.error(t("selectionAi.noSelection"));
				return;
			}
			const text = liveEditor.state.doc.textBetween(from, to, "\n").trim();
			if (!text) {
				toast.error(t("selectionAi.noSelection"));
				return;
			}
			onOpenAiPanel();
			dispatchAiContextAttach({
				selection: {
					label: relPath ?? "",
					text,
					applyResponse: (applyMode, markdown) => {
						if (liveEditor.isDestroyed || !liveEditor.isEditable) {
							return "failed";
						}
						const docEnd = liveEditor.state.doc.content.size;
						const currentText =
							from >= 0 && to <= docEnd
								? liveEditor.state.doc.textBetween(from, to, "\n").trim()
								: "";
						if (currentText !== text) return "selection-changed";
						try {
							const content = parseAiResponse(
								liveEditor,
								markdown,
								applyMode === "replace",
							);
							if (!content.length) return "failed";
							const resolvedEnd = liveEditor.state.doc.resolve(to);
							const range =
								applyMode === "replace"
									? { from, to }
									: resolvedEnd.depth > 0
										? resolvedEnd.after(1)
										: to;
							return liveEditor
								.chain()
								.focus(undefined, { scrollIntoView: false })
								.insertContentAt(range, content)
								.run()
								? "applied"
								: "failed";
						} catch {
							return "failed";
						}
					},
				},
			});
		}, [aiEnabled, liveEditor, onOpenAiPanel, relPath, t]),
		onTriggerExtractToNote: extractToNote.canExtractToNote
			? extractToNote.openExtractDialog
			: undefined,
		onRegisterCalloutInserter,
	});

	const handleFrontmatterChange = (next: string | null) => {
		const normalizedFrontmatter = next?.trim().length ? next : null;
		setFrontmatterDraft(normalizedFrontmatter ?? "");
		frontmatterRef.current = normalizedFrontmatter;
		const currentBody = normalizeBody(
			liveEditor?.getMarkdown() ?? lastAppliedBodyRef.current ?? "",
		);
		const nextMarkdown = joinYamlFrontmatter(
			normalizedFrontmatter,
			currentBody,
		);
		if (nextMarkdown === lastEmittedMarkdownRef.current) return;
		lastEmittedMarkdownRef.current = nextMarkdown;
		onChange(nextMarkdown);
		onFrontmatterCommit?.();
	};

	const renderFrontmatterWithLinks = (text: string) => {
		const tokens = extractFrontmatterLinkTokens(text);
		if (!tokens.length) return text;
		const nodes: ReactNode[] = [];
		let cursor = 0;
		for (const token of tokens) {
			if (cursor < token.start) nodes.push(text.slice(cursor, token.start));
			if (token.kind === "wiki") {
				const parsed = parseWikiLink(token.raw);
				nodes.push(
					interactive && parsed ? (
						<button
							key={`fm-${token.start}-${token.end}`}
							type="button"
							className="frontmatterInlineLink"
							onClick={() => {
								dispatchWikiLinkClick({
									raw: parsed.raw,
									target: parsed.target,
									alias: parsed.alias,
									anchorKind: parsed.anchorKind,
									anchor: parsed.anchor,
									unresolved: parsed.unresolved,
									embed: parsed.embed,
								});
							}}
						>
							{token.raw}
						</button>
					) : (
						token.raw
					),
				);
			} else {
				nodes.push(
					interactive ? (
						<button
							key={`fm-${token.start}-${token.end}`}
							type="button"
							className="frontmatterInlineLink"
							onClick={() => {
								void openFrontmatterHref(token.href, relPath ?? "");
							}}
						>
							{token.raw}
						</button>
					) : (
						token.raw
					),
				);
			}
			cursor = token.end;
		}
		if (cursor < text.length) nodes.push(text.slice(cursor));
		return nodes;
	};

	useEffect(() => {
		if (!editor || editor.isDestroyed || mode !== "rich" || chromeMinimal) {
			selectedCodeBlockRef.current = null;
			if (codeBlockCopyResetTimerRef.current !== null) {
				window.clearTimeout(codeBlockCopyResetTimerRef.current);
				codeBlockCopyResetTimerRef.current = null;
			}
			setSelectedCodeBlock(null);
			setCodeBlockCopied(false);
			return;
		}
		const host = tiptapHostRef.current;
		const contentRoot = getMountedEditorContentRoot(host);
		if (!host || !contentRoot) return;

		const clearSelectedCodeBlock = () => {
			selectedCodeBlockRef.current = null;
			if (codeBlockCopyResetTimerRef.current !== null) {
				window.clearTimeout(codeBlockCopyResetTimerRef.current);
				codeBlockCopyResetTimerRef.current = null;
			}
			setSelectedCodeBlock(null);
			setCodeBlockCopied(false);
		};

		const syncSelectedCodeBlock = () => {
			if (editor.isDestroyed) return;
			const selection = window.getSelection();
			if (!selection?.anchorNode) {
				clearSelectedCodeBlock();
				return;
			}
			const anchorElement =
				selection.anchorNode instanceof HTMLElement
					? selection.anchorNode
					: selection.anchorNode.parentElement;
			if (!anchorElement || !host.contains(anchorElement)) {
				clearSelectedCodeBlock();
				return;
			}

			const codeElement = anchorElement.closest("pre") as HTMLElement | null;
			if (!codeElement || !host.contains(codeElement)) {
				clearSelectedCodeBlock();
				return;
			}

			const parentNode = editor.state.selection.$from.parent;
			if (parentNode.type.name !== "codeBlock") {
				clearSelectedCodeBlock();
				return;
			}

			const codeOffset = getOffsetWithinAncestor(codeElement, host);
			const nextTop = codeOffset.top + 4;
			const nextControlsLeft = codeOffset.left + 10;
			const nextControlsRight = codeOffset.left + codeElement.offsetWidth - 10;
			const nextLanguage =
				typeof parentNode.attrs.language === "string"
					? parentNode.attrs.language
					: null;
			const nextPos = editor.state.selection.$from.before();
			const nextSource = parentNode.textContent ?? "";

			const nextCodeBlock = {
				top: nextTop,
				controlsLeft: nextControlsLeft,
				controlsRight: nextControlsRight,
				pos: nextPos,
				language: nextLanguage,
				source: nextSource,
			} satisfies SelectedCodeBlockState;
			if (
				!areSelectedCodeBlocksSameBlock(
					selectedCodeBlockRef.current,
					nextCodeBlock,
				)
			) {
				selectedCodeBlockRef.current = nextCodeBlock;
				if (codeBlockCopyResetTimerRef.current !== null) {
					window.clearTimeout(codeBlockCopyResetTimerRef.current);
					codeBlockCopyResetTimerRef.current = null;
				}
				setCodeBlockCopied(false);
			}
			setSelectedCodeBlock((prev) => {
				if (areSelectedCodeBlocksEqual(prev, nextCodeBlock)) return prev;
				return nextCodeBlock;
			});
		};

		syncSelectedCodeBlock();
		const scrollHost = host.closest(".rfNodeNoteEditorBody");
		let codeBlockFrame = 0;
		const scheduleSelectedCodeBlockSync = () => {
			if (codeBlockFrame) return;
			codeBlockFrame = window.requestAnimationFrame(() => {
				codeBlockFrame = 0;
				syncSelectedCodeBlock();
			});
		};
		scrollHost?.addEventListener("scroll", scheduleSelectedCodeBlockSync, {
			passive: true,
		});
		window.addEventListener("resize", scheduleSelectedCodeBlockSync);
		document.addEventListener("selectionchange", scheduleSelectedCodeBlockSync);
		editor.on("selectionUpdate", scheduleSelectedCodeBlockSync);
		editor.on("transaction", scheduleSelectedCodeBlockSync);
		return () => {
			if (codeBlockFrame) window.cancelAnimationFrame(codeBlockFrame);
			if (codeBlockCopyResetTimerRef.current !== null) {
				window.clearTimeout(codeBlockCopyResetTimerRef.current);
				codeBlockCopyResetTimerRef.current = null;
			}
			scrollHost?.removeEventListener("scroll", scheduleSelectedCodeBlockSync);
			window.removeEventListener("resize", scheduleSelectedCodeBlockSync);
			document.removeEventListener(
				"selectionchange",
				scheduleSelectedCodeBlockSync,
			);
			editor.off("selectionUpdate", scheduleSelectedCodeBlockSync);
			editor.off("transaction", scheduleSelectedCodeBlockSync);
		};
	}, [chromeMinimal, editor, mode]);

	const selectedCodeBlockLanguage = useMemo(
		() => normalizeCodeBlockLanguage(selectedCodeBlock?.language),
		[selectedCodeBlock?.language],
	);

	const applyCodeBlockLanguage = useCallback(
		(language: SupportedCodeBlockLanguage) => {
			if (!editor || editor.isDestroyed) return;
			editor
				.chain()
				.focus(null, { scrollIntoView: false })
				.updateAttributes("codeBlock", {
					language: language === "plaintext" ? null : language,
				})
				.run();
		},
		[editor],
	);
	const preventOverlayMouseDown = useCallback(
		(event: ReactMouseEvent<HTMLElement>) => {
			event.preventDefault();
		},
		[],
	);
	useEffect(() => {
		if (!editor || editor.isDestroyed) return;
		if (mode === "rich" || mode === "preview") {
			editor.commands.refreshMermaidPreviews();
		}
	}, [editor, mode]);

	useEffect(() => {
		if (!editor || editor.isDestroyed) return;
		const root = document.documentElement;
		const refresh = () => {
			if (!editor.isDestroyed && mode === "preview") {
				editor.commands.refreshMermaidPreviews();
			}
		};
		const observer = new MutationObserver(refresh);
		observer.observe(root, {
			attributes: true,
			attributeFilter: ["class", "data-theme"],
		});
		return () => observer.disconnect();
	}, [editor, mode]);

	const handleTiptapHostRef = useCallback((node: HTMLDivElement | null) => {
		tiptapHostRef.current = node;
		setTiptapHostNode(node);
	}, []);
	useEffect(() => {
		const contentRoot = getMountedEditorContentRoot(tiptapHostNode);
		const mountedEditor = liveEditor && contentRoot ? liveEditor : null;
		onEditorReady?.(mountedEditor, mountedEditor ? contentRoot : null);
		return () => onEditorReady?.(null, null);
	}, [liveEditor, onEditorReady, tiptapHostNode]);

	const copySelectedCodeBlock = useCallback(() => {
		if (!selectedCodeBlock) return;
		const clipboard = navigator.clipboard;
		if (!clipboard?.writeText) {
			console.error("Clipboard API unavailable");
			setCodeBlockCopied(false);
			return;
		}
		void clipboard
			.writeText(selectedCodeBlock.source)
			.then(() => {
				if (codeBlockCopyResetTimerRef.current !== null) {
					window.clearTimeout(codeBlockCopyResetTimerRef.current);
				}
				setCodeBlockCopied(true);
				codeBlockCopyResetTimerRef.current = window.setTimeout(() => {
					codeBlockCopyResetTimerRef.current = null;
					setCodeBlockCopied(false);
				}, 1500);
			})
			.catch((error: unknown) => {
				console.error("Failed to copy code block contents.", error);
				setCodeBlockCopied(false);
			});
	}, [selectedCodeBlock]);

	const previewSelectedCodeBlock = useCallback(() => {
		if (!editor || editor.isDestroyed || !selectedCodeBlock) return;
		const node = editor.state.doc.nodeAt(selectedCodeBlock.pos);
		if (!node || node.type.name !== "codeBlock") return;
		enableCodeBlockPreviewAt(editor.view, selectedCodeBlock.pos);
		const afterBlock = Math.min(
			selectedCodeBlock.pos + node.nodeSize,
			editor.state.doc.content.size,
		);
		editor.view.dispatch(
			editor.state.tr
				.setSelection(Selection.near(editor.state.doc.resolve(afterBlock)))
				.setMeta(CODE_BLOCK_PREVIEW_REFRESH_META, true)
				.scrollIntoView(),
		);
		editor.view.focus();
	}, [editor, selectedCodeBlock]);

	const returnToFocusedPreview = useCallback(() => {
		if (!editor || editor.isDestroyed || !focusedCodeBlockPreview) return;
		const node = editor.state.doc.nodeAt(focusedCodeBlockPreview.pos);
		setFocusedCodeBlockPreview(null);
		if (!node || node.type.name !== "codeBlock") return;
		const afterBlock = Math.min(
			focusedCodeBlockPreview.pos + node.nodeSize,
			editor.state.doc.content.size,
		);
		editor.view.dispatch(
			editor.state.tr.setSelection(
				Selection.near(editor.state.doc.resolve(afterBlock)),
			),
		);
		editor.view.focus();
	}, [editor, focusedCodeBlockPreview]);

	const selectedCodeBlockCanPreview = useMemo(
		() => isPreviewableCodeBlockLanguage(selectedCodeBlock?.language ?? null),
		[selectedCodeBlock?.language],
	);

	const codeBlockControls = useMemo(
		() => ({
			selected: selectedCodeBlock,
			language: selectedCodeBlockLanguage,
			copied: codeBlockCopied,
			canPreview: selectedCodeBlockCanPreview,
			onCodeBlockActionMouseDown: preventOverlayMouseDown,
			onApplyLanguage: applyCodeBlockLanguage,
			onCopy: copySelectedCodeBlock,
			onPreview: previewSelectedCodeBlock,
		}),
		[
			applyCodeBlockLanguage,
			codeBlockCopied,
			copySelectedCodeBlock,
			previewSelectedCodeBlock,
			preventOverlayMouseDown,
			selectedCodeBlock,
			selectedCodeBlockCanPreview,
			selectedCodeBlockLanguage,
		],
	);

	return (
		<div
			ref={noteEditorHostRef}
			className={[
				"rfNodeNoteEditor",
				"rfNodeNoteEditorFlatEdges",
				showEditorChrome ? "rfNodeNoteEditorHasRibbon" : "",
				"nodrag",
				"nopan",
			]
				.filter(Boolean)
				.join(" ")}
			onKeyDownCapture={
				canEdit ? noteFind.handleEditorKeyDownCapture : undefined
			}
		>
			<div className="rfNodeNoteEditorBody nodrag nopan nowheel">
				{noteFind.findOpen ? (
					<NoteFindBar
						countLabel={noteFind.findCountLabel}
						inputRef={noteFind.findInputRef}
						matchCount={noteFind.findMatchCount}
						query={noteFind.findQuery}
						onClose={noteFind.closeFind}
						onInputKeyDown={noteFind.handleFindInputKeyDown}
						onNext={() => noteFind.moveFindMatch(1)}
						onPrevious={() => noteFind.moveFindMatch(-1)}
						onQueryChange={noteFind.updateFindQuery}
					/>
				) : null}
				{mode === "plain" ? (
					<Suspense fallback={<div className="rfNodeNoteEditorLoading" />}>
						<RawMarkdownEditor
							key={relPath}
							ref={handleRawEditorRef}
							markdown={markdown}
							relPath={relPath}
							onChange={onChange}
						/>
					</Suspense>
				) : null}
				{mode === "rich" && showFrontmatterInEditor && frontmatterDraft ? (
					<div className="frontmatterPreview mono">
						<NotePropertiesPanel
							frontmatter={frontmatterDraft}
							onChange={handleFrontmatterChange}
						/>
					</div>
				) : mode === "rich" && showFrontmatterInEditor && frontmatter ? (
					<div className="frontmatterPreview mono">
						<pre>{renderFrontmatterWithLinks(frontmatter.trimEnd())}</pre>
					</div>
				) : null}
				{mode !== "plain" &&
				(mathExtensionsReady || !markdown.includes("$")) ? (
					<NoteEditorSurface
						editor={liveEditor}
						mode={mode}
						colorfulHeadings={colorfulHeadings}
						showHeadingPrefixes={showHeadingPrefixes}
						canEdit={canEdit}
						hostRef={handleTiptapHostRef}
						hostNode={tiptapHostNode}
						rolloverTaskActions={rolloverTaskActions}
						tableControls={tableControls}
						codeBlock={codeBlockControls}
					/>
				) : null}
			</div>
			<AnimatePresence>
				{showEditorChrome && liveEditor ? (
					<EditorRibbon
						editor={liveEditor}
						canEdit={canEdit}
						className="rfNodeNoteEditorRibbonBottom"
						onExtractSelectionToNote={
							extractToNote.canExtractToNote
								? extractToNote.openExtractDialog
								: undefined
						}
					/>
				) : null}
			</AnimatePresence>
			{showEditorChrome ? (
				<ExtractToNoteDialog
					state={extractToNote.dialogState}
					onClose={extractToNote.closeExtractDialog}
					onSubmit={extractToNote.submitExtractDialog}
					onTitleChange={extractToNote.setExtractTitle}
					onDestinationDirChange={extractToNote.setExtractDestinationDir}
				/>
			) : null}
			{showEditorChrome ? (
				<NoteLinkDialog
					editor={liveEditor}
					canEdit={canEdit}
					state={linkDialog}
					onStateChange={setLinkDialog}
				/>
			) : null}
			{showEditorChrome && mathNodeEditor.request ? (
				<Suspense fallback={null}>
					<MathNodeEditor
						key={`${mathNodeEditor.request.kind}:${mathNodeEditor.request.pos}`}
						request={mathNodeEditor.request}
						anchorRect={mathNodeEditor.getAnchorRect()}
						onApply={mathNodeEditor.apply}
						onCancel={mathNodeEditor.close}
						onDelete={mathNodeEditor.remove}
					/>
				</Suspense>
			) : null}
			<FocusedCodeBlockPreviewDialog
				preview={focusedCodeBlockPreview}
				onClose={returnToFocusedPreview}
			/>
		</div>
	);
});
