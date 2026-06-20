import { openUrl } from "@tauri-apps/plugin-opener";
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
import { joinYamlFrontmatter } from "../../lib/notePreview";
import { EditorRibbon } from "./EditorRibbon";
import { ExtractToNoteDialog } from "./ExtractToNoteDialog";
import { NoteEditorSurface } from "./NoteEditorSurface";
import { NoteFindBar } from "./NoteFindBar";
import { NoteLinkDialog, type NoteLinkDialogState } from "./NoteLinkDialog";
import { NotePropertiesPanel } from "./NotePropertiesPanel";
import {
	type SupportedCodeBlockLanguage,
	getCodeBlockLanguageLabel,
	normalizeCodeBlockLanguage,
} from "./extensions/codeBlockHighlighting";
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
import { loadMathExtensionFactory } from "./math/loadMathExtensions";
import type { SelectedCodeBlockState } from "./noteEditorOverlayTypes";
import type { RawMarkdownEditorHandle } from "./raw/types";
import type { NoteInlineEditorProps } from "./types";

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
	pasteMarkdownBehavior = "plain-text",
	onRegisterCalloutInserter,
	onEditorReady,
	onRawEditorReady,
	onChange,
	onFrontmatterCommit,
	extractToNoteActions,
}: NoteInlineEditorProps) {
	const mathNodeEditor = useMathNodeEditor();
	const [mathExtensions, setMathExtensions] = useState<
		import("@tiptap/core").AnyExtension[]
	>([]);
	const [mathExtensionsReady, setMathExtensionsReady] = useState(
		mode === "plain",
	);
	useEffect(() => {
		if (mode === "plain" || mathExtensions.length > 0) {
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
	}, [mathExtensions.length, mathNodeEditor.open, mode]);

	const {
		editor,
		frontmatter,
		frontmatterRef,
		lastAppliedBodyRef,
		lastEmittedMarkdownRef,
		colorfulHeadings,
		showFrontmatterInEditor,
	} = useNoteEditor({
		additionalExtensions: mathExtensions,
		markdown,
		mode,
		relPath,
		interactive,
		enableHydrateInlineImages: !deferHeavyFeatures,
		enableMarkdownLinkAutocomplete: !deferHeavyFeatures,
		pasteMarkdownBehavior,
		onChange,
		onMathEditRequest: mathNodeEditor.open,
	});
	mathNodeEditor.connect(editor, mode === "rich");

	const [frontmatterDraft, setFrontmatterDraft] = useState(frontmatter ?? "");
	const lastFrontmatterRef = useRef(frontmatter);
	const tiptapHostRef = useRef<HTMLDivElement | null>(null);
	const [tiptapHostNode, setTiptapHostNode] = useState<HTMLDivElement | null>(
		null,
	);
	const [codeBlockPickerOpen, setCodeBlockPickerOpen] = useState(false);
	const [selectedCodeBlock, setSelectedCodeBlock] =
		useState<SelectedCodeBlockState | null>(null);
	const selectedCodeBlockRef = useRef<SelectedCodeBlockState | null>(null);
	const codeBlockCopyResetTimerRef = useRef<number | null>(null);
	const [codeBlockCopied, setCodeBlockCopied] = useState(false);
	const [linkDialog, setLinkDialog] = useState<NoteLinkDialogState | null>(
		null,
	);
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
		onEditorReady?.(editor ?? null);
		return () => onEditorReady?.(null);
	}, [editor, onEditorReady]);

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
			blurHostSelection(host);
			previousRelPathRef.current = relPath;
		}
		return () => {
			blurHostSelection(host);
		};
	}, [relPath]);

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

	const canEdit = mode === "rich" && Boolean(editor?.isEditable);
	const selectedTable = useTableInlineControls({
		canEdit,
		editor,
		hostRef: tiptapHostRef,
		mode,
	});
	const extractToNote = useExtractSelectionToNote({
		actions: extractToNoteActions,
		canEdit,
		editor,
		hostRef: tiptapHostRef,
		relPath,
	});
	const noteFind = useNoteFind({
		editor,
		markdown,
		mode,
		relPath,
		rawEditorRef,
		tiptapHostRef,
	});

	useRibbonCommands({
		editor,
		canEdit,
		mode,
		tiptapHostRef,
		tiptapHostNode,
		onOpenLinkDialog: useCallback(
			(href: string, target: "_self" | "_blank") => {
				setLinkDialog({ href, target });
			},
			[],
		),
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
			editor?.getMarkdown() ?? lastAppliedBodyRef.current ?? "",
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
		if (!editor || mode !== "rich") {
			selectedCodeBlockRef.current = null;
			if (codeBlockCopyResetTimerRef.current !== null) {
				window.clearTimeout(codeBlockCopyResetTimerRef.current);
				codeBlockCopyResetTimerRef.current = null;
			}
			setSelectedCodeBlock(null);
			setCodeBlockPickerOpen(false);
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
			setCodeBlockPickerOpen(false);
			setCodeBlockCopied(false);
		};

		const syncSelectedCodeBlock = () => {
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
			const nextTop = codeOffset.top + 8;
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
	}, [editor, mode]);

	const selectedCodeBlockLanguage = useMemo(
		() => normalizeCodeBlockLanguage(selectedCodeBlock?.language),
		[selectedCodeBlock?.language],
	);
	const selectedCodeBlockLanguageLabel = getCodeBlockLanguageLabel(
		selectedCodeBlock?.language,
	);

	const applyCodeBlockLanguage = useCallback(
		(language: SupportedCodeBlockLanguage) => {
			if (!editor) return;
			editor
				.chain()
				.focus(null, { scrollIntoView: false })
				.updateAttributes("codeBlock", {
					language: language === "plaintext" ? null : language,
				})
				.run();
			setCodeBlockPickerOpen(false);
		},
		[editor],
	);
	const preventCodeBlockPickerMouseDown = useCallback(
		(event: ReactMouseEvent<HTMLElement>) => {
			event.preventDefault();
		},
		[],
	);
	const preventTableControlMouseDown = useCallback(
		(event: ReactMouseEvent<HTMLButtonElement>) => {
			event.preventDefault();
		},
		[],
	);
	const addRowToSelectedTable = useCallback(() => {
		if (!editor) return;
		editor.chain().focus(null, { scrollIntoView: false }).addRowAfter().run();
	}, [editor]);
	const addColumnToSelectedTable = useCallback(() => {
		if (!editor) return;
		editor
			.chain()
			.focus(null, { scrollIntoView: false })
			.addColumnAfter()
			.run();
	}, [editor]);
	useEffect(() => {
		if (!editor) return;
		if (mode === "rich" || mode === "preview") {
			editor.commands.refreshMermaidPreviews();
		}
	}, [editor, mode]);

	useEffect(() => {
		if (!editor) return;
		const root = document.documentElement;
		const refresh = () => {
			if (mode === "preview") {
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

	const tableControls = useMemo(
		() => ({
			selected: selectedTable,
			onControlMouseDown: preventTableControlMouseDown,
			onAddRow: addRowToSelectedTable,
			onAddColumn: addColumnToSelectedTable,
		}),
		[
			addColumnToSelectedTable,
			addRowToSelectedTable,
			preventTableControlMouseDown,
			selectedTable,
		],
	);

	const codeBlockControls = useMemo(
		() => ({
			selected: selectedCodeBlock,
			pickerOpen: codeBlockPickerOpen,
			onPickerOpenChange: setCodeBlockPickerOpen,
			language: selectedCodeBlockLanguage,
			languageLabel: selectedCodeBlockLanguageLabel,
			copied: codeBlockCopied,
			onPickerMouseDown: preventCodeBlockPickerMouseDown,
			onApplyLanguage: applyCodeBlockLanguage,
			onCopy: copySelectedCodeBlock,
		}),
		[
			applyCodeBlockLanguage,
			codeBlockCopied,
			codeBlockPickerOpen,
			copySelectedCodeBlock,
			preventCodeBlockPickerMouseDown,
			selectedCodeBlock,
			selectedCodeBlockLanguage,
			selectedCodeBlockLanguageLabel,
		],
	);

	return (
		<div
			className={[
				"rfNodeNoteEditor",
				"rfNodeNoteEditorFlatEdges",
				canEdit ? "rfNodeNoteEditorHasRibbon" : "",
				"nodrag",
				"nopan",
			]
				.filter(Boolean)
				.join(" ")}
			onKeyDownCapture={noteFind.handleEditorKeyDownCapture}
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
						editor={editor}
						mode={mode}
						colorfulHeadings={colorfulHeadings}
						canEdit={canEdit}
						hostRef={handleTiptapHostRef}
						table={tableControls}
						codeBlock={codeBlockControls}
					/>
				) : null}
			</div>
			<AnimatePresence>
				{canEdit && editor ? (
					<EditorRibbon
						editor={editor}
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
			<ExtractToNoteDialog
				state={extractToNote.dialogState}
				onClose={extractToNote.closeExtractDialog}
				onSubmit={extractToNote.submitExtractDialog}
				onTitleChange={extractToNote.setExtractTitle}
				onDestinationDirChange={extractToNote.setExtractDestinationDir}
			/>
			<NoteLinkDialog
				editor={editor}
				canEdit={canEdit}
				state={linkDialog}
				onStateChange={setLinkDialog}
			/>
			{mathNodeEditor.request ? (
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
		</div>
	);
});
