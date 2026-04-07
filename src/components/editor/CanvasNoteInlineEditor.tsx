import {
	ArrowLeft,
	ArrowRight,
	Calendar03Icon,
	LocationAdd01Icon,
	SourceCodeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { EditorContent } from "@tiptap/react";
import { addMonths, format, isValid, parseISO } from "date-fns";
import { AnimatePresence } from "motion/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
	MERMAID_CODE_BLOCK_LANGUAGE,
	extractMermaidErrorMessage,
	renderMermaidDiagram,
} from "../../lib/mermaid";
import { joinYamlFrontmatter } from "../../lib/notePreview";
import { todayIsoDateLocal } from "../../lib/tasks";
import { type BacklinkItem, invoke } from "../../lib/tauri";
import { Save, Trash2, X } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { Calendar as DateCalendar } from "../ui/shadcn/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { EditorRibbon } from "./EditorRibbon";
import { NotePropertiesPanel } from "./NotePropertiesPanel";
import {
	CODE_BLOCK_LANGUAGE_OPTIONS,
	type SupportedCodeBlockLanguage,
	getCodeBlockLanguageLabel,
	normalizeCodeBlockLanguage,
} from "./extensions/codeBlockHighlighting";
import { useNoteEditor } from "./hooks/useNoteEditor";
import { useResetScrollOnChange } from "./hooks/useResetScrollOnChange";
import {
	dispatchMarkdownLinkClick,
	dispatchWikiLinkClick,
} from "./markdown/editorEvents";
import { parseWikiLink } from "./markdown/wikiLinkCodec";
import type { CanvasNoteInlineEditorProps } from "./types";

function safeParseISO(value?: string): Date | undefined {
	if (!value) return undefined;
	const parsed = parseISO(value);
	return isValid(parsed) ? parsed : undefined;
}

function normalizeBody(markdown: string): string {
	return markdown.replace(/\u00a0/g, " ").replace(/&nbsp;/g, " ");
}

type FrontmatterLinkToken =
	| { kind: "wiki"; raw: string; start: number; end: number }
	| { kind: "href"; raw: string; href: string; start: number; end: number };

const FRONTMATTER_LINK_PATTERN =
	/!?\[\[[^\]\n]+\]\]|\[[^\]\n]+\]\((?:\\.|[^)\n])+\)|https?:\/\/[^\s<>"')\]]+/g;
const SELECTION_RIBBON_MARGIN_PX = 12;
const SELECTION_RIBBON_HEIGHT_PX = 40;
const SELECTION_RIBBON_EDGE_PADDING_PX = 18;
const SELECTION_RIBBON_ESTIMATED_HALF_WIDTH_PX = 176;
const SELECTION_RIBBON_HIDE_DELAY_MS = 110;
const TABLE_INLINE_CONTROL_OFFSET_PX = 20;
const TABLE_INLINE_CONTROL_EDGE_PADDING_PX = 10;

type SelectionRibbonPlacement = "above" | "below";

interface SelectionRibbonPosition {
	top: number;
	left: number;
	placement: SelectionRibbonPlacement;
}

interface SelectedCodeBlockState {
	top: number;
	controlsLeft: number;
	previewLeft: number;
	width: number;
	previewTop: number;
	pos: number;
	language: string | null;
	source: string;
}

interface SelectedTableState {
	rowControlLeft: number;
	rowControlTop: number;
	columnControlLeft: number;
	columnControlTop: number;
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

function getMountedEditorContentRoot(
	host: HTMLElement | null,
): HTMLElement | null {
	if (!host) return null;
	return host.querySelector(".ProseMirror");
}

function getOffsetWithinAncestor(
	element: HTMLElement,
	ancestor: HTMLElement,
): { left: number; top: number } {
	const elementRect = element.getBoundingClientRect();
	const ancestorRect = ancestor.getBoundingClientRect();
	return {
		left: elementRect.left - ancestorRect.left,
		top: elementRect.top - ancestorRect.top,
	};
}

async function openFrontmatterHref(
	href: string,
	sourcePath: string,
): Promise<void> {
	if (href.startsWith("http://") || href.startsWith("https://")) {
		await openUrl(href);
		return;
	}
	if (href.startsWith("#")) return;
	dispatchMarkdownLinkClick({ href, sourcePath });
}

function getSelectionRibbonPosition(
	host: HTMLElement,
	selection: Selection,
): SelectionRibbonPosition | null {
	if (selection.rangeCount === 0 || selection.isCollapsed) return null;
	const range = selection.getRangeAt(0);
	if (range.collapsed) return null;
	if (!host.contains(range.commonAncestorContainer)) return null;

	const lineRects = Array.from(range.getClientRects()).filter(
		(rect) => rect.width > 0 || rect.height > 0,
	);
	if (lineRects.length === 0) return null;

	const hostRect = host.getBoundingClientRect();
	const firstLineRect = lineRects[0];
	const lastLineRect = lineRects[lineRects.length - 1];
	const firstLineTopWithinHost = firstLineRect.top - hostRect.top;
	const lastLineBottomWithinHost = lastLineRect.bottom - hostRect.top;
	const placeAbove =
		firstLineTopWithinHost >=
		SELECTION_RIBBON_HEIGHT_PX + SELECTION_RIBBON_MARGIN_PX;
	const placement: SelectionRibbonPlacement = placeAbove ? "above" : "below";
	const anchorRect = placement === "above" ? firstLineRect : lastLineRect;
	const top =
		placement === "above"
			? firstLineTopWithinHost - SELECTION_RIBBON_MARGIN_PX
			: lastLineBottomWithinHost + SELECTION_RIBBON_MARGIN_PX;
	const left = anchorRect.left - hostRect.left + anchorRect.width / 2;
	const centerFallback = host.clientWidth / 2;
	const minLeft = Math.min(
		centerFallback,
		SELECTION_RIBBON_EDGE_PADDING_PX + SELECTION_RIBBON_ESTIMATED_HALF_WIDTH_PX,
	);
	const maxLeft = Math.max(
		centerFallback,
		host.clientWidth -
			SELECTION_RIBBON_EDGE_PADDING_PX -
			SELECTION_RIBBON_ESTIMATED_HALF_WIDTH_PX,
	);

	return {
		top: Math.max(0, top),
		left: Math.min(Math.max(left, minLeft), maxLeft),
		placement,
	};
}

function MermaidPreviewPanel({
	source,
	style,
	onHeightChange,
}: {
	source: string;
	style: React.CSSProperties;
	onHeightChange: (height: number) => void;
}) {
	const [svg, setSvg] = useState("");
	const [error, setError] = useState("");
	const panelRef = useRef<HTMLDivElement | null>(null);
	const svgHostRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const panel = panelRef.current;
		if (!panel) return;

		let raf = 0;
		const reportHeight = () => {
			raf = 0;
			const nextHeight = Math.ceil(
				Math.max(panel.offsetHeight, panel.scrollHeight),
			);
			onHeightChange(nextHeight);
		};

		reportHeight();
		const observer = new ResizeObserver(() => {
			if (raf) window.cancelAnimationFrame(raf);
			raf = window.requestAnimationFrame(reportHeight);
		});
		observer.observe(panel);
		return () => {
			if (raf) window.cancelAnimationFrame(raf);
			observer.disconnect();
		};
	}, [onHeightChange]);

	useEffect(() => {
		let cancelled = false;
		setError("");
		const timeout = window.setTimeout(() => {
			void (async () => {
				try {
					const nextSvg = await renderMermaidDiagram(source);
					if (cancelled) return;
					setSvg(nextSvg);
				} catch (nextError) {
					if (cancelled) return;
					setSvg("");
					setError(extractMermaidErrorMessage(nextError));
				}
			})();
		}, 320);
		return () => {
			cancelled = true;
			window.clearTimeout(timeout);
		};
	}, [source]);

	useEffect(() => {
		const host = svgHostRef.current;
		if (!host) return;
		host.replaceChildren();
		if (!svg) return;

		const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
		const svgElement = doc.documentElement;
		if (svgElement.tagName.toLowerCase() !== "svg") {
			setError("Unable to render Mermaid diagram.");
			setSvg("");
			return;
		}
		host.append(document.importNode(svgElement, true));
	}, [svg]);

	return (
		<div className="mermaidPreviewPanel" style={style} ref={panelRef}>
			<div className="mermaidPreviewCanvas">
				{error ? <div className="mermaidPreviewError">{error}</div> : null}
				{svg ? <div className="mermaidPreviewSvg" ref={svgHostRef} /> : null}
				{svg || error ? null : (
					<div className="mermaidPreviewLoading">
						Rendering Mermaid preview…
					</div>
				)}
			</div>
		</div>
	);
}

export const CanvasNoteInlineEditor = memo(function CanvasNoteInlineEditor({
	markdown,
	relPath,
	mode,
	zenModeActive = false,
	interactive = true,
	showBacklinks = true,
	deferHeavyFeatures = false,
	pasteMarkdownBehavior = "plain-text",
	onRegisterCalloutInserter,
	onEditorReady,
	onChange,
}: CanvasNoteInlineEditorProps) {
	const {
		editor,
		frontmatter,
		frontmatterRef,
		lastAppliedBodyRef,
		lastEmittedMarkdownRef,
	} = useNoteEditor({
		markdown,
		mode,
		zenModeActive,
		relPath,
		interactive,
		enableHydrateInlineImages: !deferHeavyFeatures,
		enableMarkdownLinkAutocomplete: !deferHeavyFeatures,
		pasteMarkdownBehavior,
		onChange,
	});

	const [frontmatterDraft, setFrontmatterDraft] = useState(frontmatter ?? "");
	const lastFrontmatterRef = useRef(frontmatter);
	const [backlinks, setBacklinks] = useState<BacklinkItem[]>([]);
	const tiptapHostRef = useRef<HTMLDivElement | null>(null);
	const [tiptapHostNode, setTiptapHostNode] = useState<HTMLDivElement | null>(
		null,
	);
	const [editorFocused, setEditorFocused] = useState(false);
	const [taskAnchors, setTaskAnchors] = useState<
		Array<{
			left: number;
			ordinal: number;
			top: number;
		}>
	>([]);
	const [selectedTaskOrdinal, setSelectedTaskOrdinal] = useState<number | null>(
		null,
	);
	const [scheduleAnchor, setScheduleAnchor] = useState<{
		left: number;
		ordinal: number;
		top: number;
	} | null>(null);
	const [activeDateField, setActiveDateField] = useState<"scheduled" | "due">(
		"scheduled",
	);
	const [pickerMonth, setPickerMonth] = useState<Date>(() => new Date());
	const [scheduledDate, setScheduledDate] = useState("");
	const [dueDate, setDueDate] = useState("");
	const [selectionRibbon, setSelectionRibbon] =
		useState<SelectionRibbonPosition | null>(null);
	const selectionRibbonHideTimerRef = useRef<number | null>(null);
	const selectedTableSyncRafRef = useRef<number | null>(null);
	const [selectedTable, setSelectedTable] = useState<SelectedTableState | null>(
		null,
	);
	const [codeBlockPickerOpen, setCodeBlockPickerOpen] = useState(false);
	const [selectedCodeBlock, setSelectedCodeBlock] =
		useState<SelectedCodeBlockState | null>(null);
	const [activeMermaidPreviewPos, setActiveMermaidPreviewPos] = useState<
		number | null
	>(null);
	const [activeMermaidPreviewHeight, setActiveMermaidPreviewHeight] =
		useState(0);
	const previousRelPathRef = useRef(relPath);

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

	useEffect(() => {
		if (!relPath || !showBacklinks || deferHeavyFeatures) {
			setBacklinks([]);
			return;
		}
		let cancelled = false;
		void (async () => {
			try {
				const items = await invoke("backlinks", { note_id: relPath });
				if (!cancelled) setBacklinks(items);
			} catch {
				if (!cancelled) setBacklinks([]);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [deferHeavyFeatures, relPath, showBacklinks]);

	const canEdit = mode === "rich" && Boolean(editor?.isEditable);

	useEffect(() => {
		if (!editor || mode !== "rich" || !canEdit) {
			if (selectionRibbonHideTimerRef.current !== null) {
				window.clearTimeout(selectionRibbonHideTimerRef.current);
				selectionRibbonHideTimerRef.current = null;
			}
			setSelectionRibbon(null);
			return;
		}
		const host = tiptapHostRef.current;
		if (!host || !getMountedEditorContentRoot(host)) return;
		let raf = 0;

		const syncSelectionRibbon = () => {
			if (raf) window.cancelAnimationFrame(raf);
			raf = window.requestAnimationFrame(() => {
				raf = 0;
				const selection = window.getSelection();
				if (!selection) {
					if (selectionRibbonHideTimerRef.current !== null) {
						window.clearTimeout(selectionRibbonHideTimerRef.current);
					}
					selectionRibbonHideTimerRef.current = window.setTimeout(() => {
						selectionRibbonHideTimerRef.current = null;
						setSelectionRibbon(null);
					}, SELECTION_RIBBON_HIDE_DELAY_MS);
					return;
				}
				const next = getSelectionRibbonPosition(host, selection);
				if (next) {
					if (selectionRibbonHideTimerRef.current !== null) {
						window.clearTimeout(selectionRibbonHideTimerRef.current);
						selectionRibbonHideTimerRef.current = null;
					}
				} else {
					if (selectionRibbonHideTimerRef.current !== null) {
						window.clearTimeout(selectionRibbonHideTimerRef.current);
					}
					selectionRibbonHideTimerRef.current = window.setTimeout(() => {
						selectionRibbonHideTimerRef.current = null;
						setSelectionRibbon(null);
					}, SELECTION_RIBBON_HIDE_DELAY_MS);
					return;
				}
				setSelectionRibbon((current) => {
					if (
						current &&
						next &&
						current.top === next.top &&
						current.left === next.left &&
						current.placement === next.placement
					) {
						return current;
					}
					return next;
				});
			});
		};

		syncSelectionRibbon();
		document.addEventListener("selectionchange", syncSelectionRibbon);
		editor.on("selectionUpdate", syncSelectionRibbon);
		window.addEventListener("resize", syncSelectionRibbon);
		return () => {
			if (raf) window.cancelAnimationFrame(raf);
			if (selectionRibbonHideTimerRef.current !== null) {
				window.clearTimeout(selectionRibbonHideTimerRef.current);
				selectionRibbonHideTimerRef.current = null;
			}
			document.removeEventListener("selectionchange", syncSelectionRibbon);
			editor.off("selectionUpdate", syncSelectionRibbon);
			window.removeEventListener("resize", syncSelectionRibbon);
		};
	}, [canEdit, editor, mode]);

	useEffect(() => {
		if (!onRegisterCalloutInserter) return;
		if (!editor || mode !== "rich") {
			onRegisterCalloutInserter(null);
			return;
		}
		onRegisterCalloutInserter((type: string) => {
			const normalizedType =
				type.toLowerCase() === "warn" ? "warning" : type.toLowerCase();
			const host = tiptapHostRef.current?.closest(
				".rfNodeNoteEditorBody",
			) as HTMLElement | null;
			const scrollTop = host?.scrollTop ?? 0;
			editor
				.chain()
				.focus(undefined, { scrollIntoView: false })
				.insertContent({
					type: "blockquote",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: `[!${normalizedType}]` }],
						},
						{ type: "paragraph" },
					],
				})
				.run();
			if (host) {
				requestAnimationFrame(() => {
					host.scrollTop = scrollTop;
				});
			}
		});
		return () => onRegisterCalloutInserter(null);
	}, [editor, mode, onRegisterCalloutInserter]);

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
	};

	const renderFrontmatterWithLinks = (text: string) => {
		const tokens = extractFrontmatterLinkTokens(text);
		if (!tokens.length) return text;
		const nodes: React.ReactNode[] = [];
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
		if (!editor || mode !== "rich" || !canEdit) {
			setSelectedTable(null);
			return;
		}
		const host = tiptapHostRef.current;
		const contentRoot = getMountedEditorContentRoot(host);
		if (!host || !contentRoot) return;

		const syncSelectedTable = () => {
			const selection = window.getSelection();
			const anchorElement =
				selection?.anchorNode instanceof HTMLElement
					? selection.anchorNode
					: selection?.anchorNode?.parentElement;

			if (!anchorElement || !contentRoot.contains(anchorElement)) {
				setSelectedTable(null);
				return;
			}

			const activeCell = anchorElement.closest("td, th") as HTMLElement | null;
			if (!activeCell || !contentRoot.contains(activeCell)) {
				setSelectedTable(null);
				return;
			}

			const activeRow = activeCell.closest("tr") as HTMLElement | null;
			const activeTable = activeCell.closest("table") as HTMLElement | null;
			if (!activeRow || !activeTable || !contentRoot.contains(activeTable)) {
				setSelectedTable(null);
				return;
			}

			const rowOffset = getOffsetWithinAncestor(activeRow, host);
			const cellOffset = getOffsetWithinAncestor(activeCell, host);
			const tableOffset = getOffsetWithinAncestor(activeTable, host);
			const nextState: SelectedTableState = {
				rowControlLeft: Math.max(
					TABLE_INLINE_CONTROL_EDGE_PADDING_PX,
					tableOffset.left - TABLE_INLINE_CONTROL_OFFSET_PX,
				),
				rowControlTop: rowOffset.top + activeRow.offsetHeight / 2,
				columnControlLeft: cellOffset.left + activeCell.offsetWidth / 2,
				columnControlTop: Math.max(
					TABLE_INLINE_CONTROL_EDGE_PADDING_PX,
					tableOffset.top - TABLE_INLINE_CONTROL_OFFSET_PX,
				),
			};

			setSelectedTable((current) => {
				if (
					current &&
					current.rowControlLeft === nextState.rowControlLeft &&
					current.rowControlTop === nextState.rowControlTop &&
					current.columnControlLeft === nextState.columnControlLeft &&
					current.columnControlTop === nextState.columnControlTop
				) {
					return current;
				}
				return nextState;
			});
		};

		const scheduleSyncSelectedTable = () => {
			if (selectedTableSyncRafRef.current !== null) return;
			selectedTableSyncRafRef.current = window.requestAnimationFrame(() => {
				selectedTableSyncRafRef.current = null;
				syncSelectedTable();
			});
		};

		scheduleSyncSelectedTable();
		const scrollHost = host.closest(".rfNodeNoteEditorBody");
		scrollHost?.addEventListener("scroll", scheduleSyncSelectedTable, {
			passive: true,
		});
		window.addEventListener("resize", scheduleSyncSelectedTable);
		document.addEventListener("selectionchange", scheduleSyncSelectedTable);
		editor.on("selectionUpdate", scheduleSyncSelectedTable);
		editor.on("transaction", scheduleSyncSelectedTable);
		return () => {
			if (selectedTableSyncRafRef.current !== null) {
				window.cancelAnimationFrame(selectedTableSyncRafRef.current);
				selectedTableSyncRafRef.current = null;
			}
			scrollHost?.removeEventListener("scroll", scheduleSyncSelectedTable);
			window.removeEventListener("resize", scheduleSyncSelectedTable);
			document.removeEventListener(
				"selectionchange",
				scheduleSyncSelectedTable,
			);
			editor.off("selectionUpdate", scheduleSyncSelectedTable);
			editor.off("transaction", scheduleSyncSelectedTable);
		};
	}, [canEdit, editor, mode]);

	useEffect(() => {
		if (!editor || mode !== "rich" || deferHeavyFeatures) {
			setTaskAnchors([]);
			setSelectedTaskOrdinal(null);
			setScheduleAnchor(null);
			return;
		}
		const host = tiptapHostRef.current;
		const contentRoot = getMountedEditorContentRoot(host);
		if (!host || !contentRoot) return;

		const syncAnchors = () => {
			const items = Array.from(
				contentRoot.querySelectorAll(
					"li[data-type='taskItem'], li[data-checked]",
				),
			) as HTMLElement[];
			const nextAnchors = items.map((item, ordinal) => {
				const { left, top } = getOffsetWithinAncestor(item, host);
				const nextTop =
					top + Math.max(0, Math.round((item.offsetHeight - 18) / 2));
				return {
					left: Math.max(12, left - 24),
					ordinal,
					top: nextTop,
				};
			});
			setTaskAnchors((current) => {
				if (
					current.length === nextAnchors.length &&
					current.every(
						(anchor, index) =>
							anchor.left === nextAnchors[index]?.left &&
							anchor.ordinal === nextAnchors[index]?.ordinal &&
							anchor.top === nextAnchors[index]?.top,
					)
				) {
					return current;
				}
				return nextAnchors;
			});
		};
		const syncSelectedTask = () => {
			const selection = window.getSelection();
			if (!selection?.anchorNode) {
				setSelectedTaskOrdinal(null);
				return;
			}
			const anchorElement =
				selection.anchorNode instanceof HTMLElement
					? selection.anchorNode
					: selection.anchorNode.parentElement;
			if (!anchorElement || !contentRoot.contains(anchorElement)) {
				setSelectedTaskOrdinal(null);
				return;
			}
			const taskEl = anchorElement.closest(
				"li[data-type='taskItem'], li[data-checked]",
			) as HTMLElement | null;
			if (!taskEl) {
				setSelectedTaskOrdinal(null);
				return;
			}
			const items = Array.from(
				contentRoot.querySelectorAll(
					"li[data-type='taskItem'], li[data-checked]",
				),
			) as HTMLElement[];
			const ordinal = items.indexOf(taskEl);
			setSelectedTaskOrdinal((current) => {
				const nextOrdinal = ordinal >= 0 ? ordinal : null;
				return current === nextOrdinal ? current : nextOrdinal;
			});
		};

		syncAnchors();
		syncSelectedTask();
		const observer = new MutationObserver(() => syncAnchors());
		observer.observe(contentRoot, {
			childList: true,
			subtree: true,
			characterData: true,
		});
		document.addEventListener("selectionchange", syncSelectedTask);
		editor.on("selectionUpdate", syncSelectedTask);
		return () => {
			observer.disconnect();
			document.removeEventListener("selectionchange", syncSelectedTask);
			editor.off("selectionUpdate", syncSelectedTask);
		};
	}, [deferHeavyFeatures, editor, mode]);

	useEffect(() => {
		if (!editor || mode !== "rich") {
			setSelectedCodeBlock(null);
			setCodeBlockPickerOpen(false);
			return;
		}
		const host = tiptapHostRef.current;
		const contentRoot = getMountedEditorContentRoot(host);
		if (!host || !contentRoot) return;

		const syncSelectedCodeBlock = () => {
			const selection = window.getSelection();
			if (!selection?.anchorNode) {
				setSelectedCodeBlock(null);
				setCodeBlockPickerOpen(false);
				return;
			}
			const anchorElement =
				selection.anchorNode instanceof HTMLElement
					? selection.anchorNode
					: selection.anchorNode.parentElement;
			if (!anchorElement || !host.contains(anchorElement)) {
				setSelectedCodeBlock(null);
				setCodeBlockPickerOpen(false);
				return;
			}

			const codeElement = anchorElement.closest("pre") as HTMLElement | null;
			if (!codeElement || !host.contains(codeElement)) {
				setSelectedCodeBlock(null);
				setCodeBlockPickerOpen(false);
				return;
			}

			const parentNode = editor.state.selection.$from.parent;
			if (parentNode.type.name !== "codeBlock") {
				setSelectedCodeBlock(null);
				setCodeBlockPickerOpen(false);
				return;
			}

			const codeOffset = getOffsetWithinAncestor(codeElement, host);
			const nextTop = codeOffset.top + 8;
			const nextControlsLeft = codeOffset.left + 10;
			const nextPreviewLeft = codeOffset.left;
			const nextWidth = Math.max(220, codeElement.offsetWidth);
			const nextPreviewTop = codeOffset.top + codeElement.offsetHeight + 12;
			const nextLanguage =
				typeof parentNode.attrs.language === "string"
					? parentNode.attrs.language
					: null;
			const nextPos = editor.state.selection.$from.before();
			const nextSource = parentNode.textContent ?? "";

			setSelectedCodeBlock((prev) => {
				if (
					prev &&
					prev.top === nextTop &&
					prev.controlsLeft === nextControlsLeft &&
					prev.previewLeft === nextPreviewLeft &&
					prev.width === nextWidth &&
					prev.previewTop === nextPreviewTop &&
					prev.pos === nextPos &&
					prev.language === nextLanguage &&
					prev.source === nextSource
				) {
					return prev;
				}
				return {
					top: nextTop,
					controlsLeft: nextControlsLeft,
					previewLeft: nextPreviewLeft,
					width: nextWidth,
					previewTop: nextPreviewTop,
					pos: nextPos,
					language: nextLanguage,
					source: nextSource,
				};
			});
		};

		syncSelectedCodeBlock();
		const scrollHost = host.closest(".rfNodeNoteEditorBody");
		scrollHost?.addEventListener("scroll", syncSelectedCodeBlock, {
			passive: true,
		});
		window.addEventListener("resize", syncSelectedCodeBlock);
		document.addEventListener("selectionchange", syncSelectedCodeBlock);
		editor.on("selectionUpdate", syncSelectedCodeBlock);
		editor.on("transaction", syncSelectedCodeBlock);
		return () => {
			scrollHost?.removeEventListener("scroll", syncSelectedCodeBlock);
			window.removeEventListener("resize", syncSelectedCodeBlock);
			document.removeEventListener("selectionchange", syncSelectedCodeBlock);
			editor.off("selectionUpdate", syncSelectedCodeBlock);
			editor.off("transaction", syncSelectedCodeBlock);
		};
	}, [editor, mode]);

	const selectedTaskAnchor =
		selectedTaskOrdinal == null
			? null
			: (taskAnchors.find((anchor) => anchor.ordinal === selectedTaskOrdinal) ??
				null);
	const selectedCodeBlockLanguage = useMemo(
		() => normalizeCodeBlockLanguage(selectedCodeBlock?.language),
		[selectedCodeBlock?.language],
	);
	const selectedCodeBlockLanguageLabel = getCodeBlockLanguageLabel(
		selectedCodeBlock?.language,
	);
	const isSelectedMermaidCodeBlock =
		selectedCodeBlockLanguage === MERMAID_CODE_BLOCK_LANGUAGE;
	const isSelectedMermaidPreviewActive =
		isSelectedMermaidCodeBlock &&
		selectedCodeBlock?.pos === activeMermaidPreviewPos;

	const openTaskPopover = async (anchor: {
		left: number;
		ordinal: number;
		top: number;
	}) => {
		setScheduleAnchor(anchor);
		try {
			const existing = await invoke("task_dates_by_ordinal", {
				markdown,
				ordinal: anchor.ordinal,
			});
			setScheduledDate(existing?.scheduled_date ?? "");
			setDueDate(existing?.due_date ?? "");
			const nextField = existing?.due_date ? "due" : "scheduled";
			setActiveDateField(nextField);
			setPickerMonth(
				safeParseISO(existing?.due_date) ??
					safeParseISO(existing?.scheduled_date) ??
					new Date(),
			);
		} catch {
			setScheduledDate("");
			setDueDate("");
			setActiveDateField("scheduled");
			setPickerMonth(new Date());
		}
	};
	const applyTaskDates = async () => {
		if (!scheduleAnchor) return;
		const next = await invoke("task_update_by_ordinal", {
			markdown,
			ordinal: scheduleAnchor.ordinal,
			scheduled_date: scheduledDate,
			due_date: dueDate,
		});
		if (!next) return;
		onChange(next);
		setScheduleAnchor(null);
	};

	const activeDateValue =
		activeDateField === "scheduled" ? scheduledDate : dueDate;

	const activeDate = useMemo(() => {
		return safeParseISO(activeDateValue);
	}, [activeDateValue]);

	const formatPickerValue = (value: string) => {
		if (!value) return "Select date";
		const parsed = safeParseISO(value);
		return parsed ? format(parsed, "MMM d, yyyy") : value;
	};

	const focusField = (field: "scheduled" | "due") => {
		setActiveDateField(field);
		const nextValue = field === "scheduled" ? scheduledDate : dueDate;
		if (!nextValue) {
			setPickerMonth(new Date());
			return;
		}
		setPickerMonth(safeParseISO(nextValue) ?? new Date());
	};

	const updateActiveDate = (date?: Date) => {
		const next = date ? todayIsoDateLocal(date) : "";
		if (activeDateField === "scheduled") {
			setScheduledDate(next);
			return;
		}
		setDueDate(next);
	};

	const applyCodeBlockLanguage = (language: SupportedCodeBlockLanguage) => {
		if (!editor) return;
		editor
			.chain()
			.focus(undefined, { scrollIntoView: false })
			.updateAttributes("codeBlock", {
				language: language === "plaintext" ? null : language,
			})
			.run();
		if (language !== MERMAID_CODE_BLOCK_LANGUAGE) {
			setActiveMermaidPreviewPos(null);
		}
		setCodeBlockPickerOpen(false);
	};
	const preventCodeBlockPickerMouseDown = (
		event: React.MouseEvent<HTMLElement>,
	) => {
		event.preventDefault();
	};
	const preventTableControlMouseDown = (
		event: React.MouseEvent<HTMLButtonElement>,
	) => {
		event.preventDefault();
	};
	const addRowToSelectedTable = () => {
		if (!editor) return;
		editor
			.chain()
			.focus(undefined, { scrollIntoView: false })
			.addRowAfter()
			.run();
	};
	const addColumnToSelectedTable = () => {
		if (!editor) return;
		editor
			.chain()
			.focus(undefined, { scrollIntoView: false })
			.addColumnAfter()
			.run();
	};
	const handleEditorPointerDownCapture = (
		event: React.PointerEvent<HTMLDivElement>,
	) => {
		if (!canEdit || activeMermaidPreviewPos === null) return;
		const target = event.target instanceof HTMLElement ? event.target : null;
		if (
			target?.closest(".codeBlockPreviewBtn") ||
			target?.closest(".codeBlockLanguageBtn") ||
			target?.closest(".codeBlockLanguagePopover")
		) {
			return;
		}
		flushSync(() => {
			setActiveMermaidPreviewPos(null);
			setActiveMermaidPreviewHeight(0);
		});
	};
	const toggleSelectedMermaidPreview = () => {
		if (!selectedCodeBlock || !isSelectedMermaidCodeBlock) return;
		setActiveMermaidPreviewPos((prev) =>
			prev === selectedCodeBlock.pos ? null : selectedCodeBlock.pos,
		);
	};

	useEffect(() => {
		if (!selectedCodeBlock || !isSelectedMermaidCodeBlock) {
			setActiveMermaidPreviewPos(null);
			setActiveMermaidPreviewHeight(0);
		}
	}, [isSelectedMermaidCodeBlock, selectedCodeBlock]);

	useEffect(() => {
		if (!editor) return;
		editor.commands.setActiveMermaidPreview(
			isSelectedMermaidPreviewActive ? activeMermaidPreviewPos : null,
		);
	}, [activeMermaidPreviewPos, editor, isSelectedMermaidPreviewActive]);

	useEffect(() => {
		if (!editor) return;
		editor.commands.setRichMermaidPreviewHeight(
			isSelectedMermaidPreviewActive ? activeMermaidPreviewHeight : 0,
		);
	}, [activeMermaidPreviewHeight, editor, isSelectedMermaidPreviewActive]);

	useEffect(() => {
		if (!editor) return;
		if (mode === "preview") {
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

	useEffect(() => {
		const host = tiptapHostNode;
		if (!host) return;
		const handleFocusIn = () => setEditorFocused(true);
		const handleFocusOut = () => {
			window.setTimeout(() => {
				setEditorFocused(host.contains(document.activeElement));
			}, 0);
		};
		handleFocusOut();
		host.addEventListener("focusin", handleFocusIn);
		host.addEventListener("focusout", handleFocusOut);
		return () => {
			host.removeEventListener("focusin", handleFocusIn);
			host.removeEventListener("focusout", handleFocusOut);
		};
	}, [tiptapHostNode]);

	const handleTiptapHostRef = useCallback((node: HTMLDivElement | null) => {
		tiptapHostRef.current = node;
		setTiptapHostNode(node);
	}, []);

	return (
		<div
			className={[
				"rfNodeNoteEditor",
				"rfNodeNoteEditorFlatEdges",
				"nodrag",
				"nopan",
			]
				.filter(Boolean)
				.join(" ")}
		>
			<div className="rfNodeNoteEditorBody nodrag nopan nowheel">
				{mode === "plain" ? (
					<textarea
						className="rfNodeNoteEditorRaw mono"
						value={markdown}
						onChange={(event) => onChange(event.target.value)}
						spellCheck={false}
					/>
				) : null}
				{mode === "rich" && frontmatterDraft && !zenModeActive ? (
					<div className="frontmatterPreview mono">
						<NotePropertiesPanel
							frontmatter={frontmatterDraft}
							onChange={handleFrontmatterChange}
						/>
					</div>
				) : frontmatter && !zenModeActive ? (
					<div className="frontmatterPreview mono">
						<pre>{renderFrontmatterWithLinks(frontmatter.trimEnd())}</pre>
					</div>
				) : null}
				{mode !== "plain" ? (
					<div
						ref={handleTiptapHostRef}
						className={[
							"tiptapHostInline",
							mode === "preview" ? "is-preview" : "",
							zenModeActive ? "is-zen-mode" : "",
							zenModeActive && !editorFocused ? "is-zen-unfocused" : "",
							"nodrag",
							"nopan",
							"nowheel",
						]
							.filter(Boolean)
							.join(" ")}
						onPointerDownCapture={handleEditorPointerDownCapture}
					>
						<EditorContent editor={editor} />
						<AnimatePresence initial={false}>
							{canEdit && selectionRibbon ? (
								<EditorRibbon
									editor={editor}
									canEdit={canEdit}
									style={{
										top: `${selectionRibbon.top}px`,
										left: `${selectionRibbon.left}px`,
										transform:
											selectionRibbon.placement === "above"
												? "translate(-50%, -100%)"
												: "translate(-50%, 0)",
									}}
								/>
							) : null}
						</AnimatePresence>
						{canEdit && selectedTable ? (
							<>
								<button
									type="button"
									className="tableInlineAddBtn is-row"
									data-axis="row"
									aria-label="Add row"
									title="Add row"
									style={{
										left: `${selectedTable.rowControlLeft}px`,
										top: `${selectedTable.rowControlTop}px`,
									}}
									onMouseDown={preventTableControlMouseDown}
									onClick={addRowToSelectedTable}
								>
									<HugeiconsIcon
										icon={LocationAdd01Icon}
										size={14}
										strokeWidth={0.9}
									/>
								</button>
								<button
									type="button"
									className="tableInlineAddBtn is-column"
									data-axis="column"
									aria-label="Add column"
									title="Add column"
									style={{
										left: `${selectedTable.columnControlLeft}px`,
										top: `${selectedTable.columnControlTop}px`,
									}}
									onMouseDown={preventTableControlMouseDown}
									onClick={addColumnToSelectedTable}
								>
									<HugeiconsIcon
										icon={LocationAdd01Icon}
										size={14}
										strokeWidth={0.9}
									/>
								</button>
							</>
						) : null}
						{canEdit && selectedCodeBlock ? (
							<div
								className="codeBlockInlineControls"
								style={{
									top: `${selectedCodeBlock.top}px`,
									left: `${selectedCodeBlock.controlsLeft}px`,
								}}
							>
								<Popover
									open={codeBlockPickerOpen}
									onOpenChange={setCodeBlockPickerOpen}
								>
									<PopoverTrigger asChild>
										<button
											type="button"
											className="codeBlockLanguageBtn"
											onMouseDown={preventCodeBlockPickerMouseDown}
											title="Set code block language"
										>
											<span className="codeBlockLanguageBtnIcon" aria-hidden>
												<HugeiconsIcon
													icon={SourceCodeIcon}
													size={12}
													strokeWidth={0.9}
												/>
											</span>
											<span className="codeBlockLanguageBtnLabel mono">
												{selectedCodeBlockLanguageLabel}
											</span>
										</button>
									</PopoverTrigger>
									<PopoverContent
										className="codeBlockLanguagePopover"
										align="start"
									>
										<div className="codeBlockLanguagePopoverHeader">
											Code block language
										</div>
										<div className="codeBlockLanguageOptions">
											{CODE_BLOCK_LANGUAGE_OPTIONS.map((option) => (
												<Button
													key={option.value}
													type="button"
													size="xs"
													variant={
														option.value === selectedCodeBlockLanguage
															? "secondary"
															: "ghost"
													}
													className="codeBlockLanguageOption"
													onMouseDown={preventCodeBlockPickerMouseDown}
													onClick={() => applyCodeBlockLanguage(option.value)}
												>
													{option.label}
												</Button>
											))}
										</div>
									</PopoverContent>
								</Popover>
								{isSelectedMermaidCodeBlock ? (
									<button
										type="button"
										className="codeBlockPreviewBtn"
										onMouseDown={preventCodeBlockPickerMouseDown}
										onClick={toggleSelectedMermaidPreview}
										title={
											isSelectedMermaidPreviewActive
												? "Stop Mermaid preview"
												: "Play Mermaid preview"
										}
									>
										<span className="codeBlockPreviewBtnLabel mono">
											{isSelectedMermaidPreviewActive ? "Stop" : "Play"}
										</span>
									</button>
								) : null}
							</div>
						) : null}
						{canEdit && selectedCodeBlock && isSelectedMermaidPreviewActive ? (
							<MermaidPreviewPanel
								source={selectedCodeBlock.source}
								style={{
									top: `${selectedCodeBlock.previewTop}px`,
									left: `${selectedCodeBlock.previewLeft}px`,
									width: `${selectedCodeBlock.width}px`,
								}}
								onHeightChange={setActiveMermaidPreviewHeight}
							/>
						) : null}
						{canEdit && selectedTaskAnchor ? (
							<Popover
								open={scheduleAnchor?.ordinal === selectedTaskAnchor.ordinal}
								onOpenChange={(open) => {
									if (!open) setScheduleAnchor(null);
								}}
							>
								<PopoverTrigger asChild>
									<button
										type="button"
										className="taskInlineDateBtn"
										style={{
											top: `${selectedTaskAnchor.top}px`,
										}}
										onClick={() => {
											void openTaskPopover(selectedTaskAnchor);
										}}
										title="Schedule selected task"
									>
										<HugeiconsIcon
											icon={Calendar03Icon}
											size={13}
											strokeWidth={0.9}
											aria-hidden
										/>
									</button>
								</PopoverTrigger>
								<PopoverContent
									className="tasksDatePopover taskInlineDatePopover"
									align="start"
									onInteractOutside={(event) => event.preventDefault()}
									onPointerDownOutside={(event) => event.preventDefault()}
								>
									<div className="tasksDatePickerFields">
										<button
											type="button"
											className="tasksDateFieldCard"
											data-active={activeDateField === "scheduled"}
											onClick={() => focusField("scheduled")}
										>
											<span className="tasksDateFieldLabel">Scheduled</span>
											<span
												className="tasksDateFieldValue"
												data-empty={!scheduledDate}
											>
												{formatPickerValue(scheduledDate)}
											</span>
										</button>
										<button
											type="button"
											className="tasksDateFieldCard"
											data-active={activeDateField === "due"}
											onClick={() => focusField("due")}
										>
											<span className="tasksDateFieldLabel">Due</span>
											<span
												className="tasksDateFieldValue"
												data-empty={!dueDate}
											>
												{formatPickerValue(dueDate)}
											</span>
										</button>
									</div>
									<div className="tasksDatePickerShell">
										<DateCalendar
											mode="single"
											selected={activeDate}
											onSelect={updateActiveDate}
											month={pickerMonth}
											onMonthChange={setPickerMonth}
											className="tasksDateCalendar"
										/>
									</div>
									<div className="tasksQuickDates">
										<Button
											type="button"
											variant="outline"
											size="xs"
											onClick={() => {
												const d = new Date();
												d.setDate(d.getDate() + 0);
												setScheduledDate(todayIsoDateLocal(d));
												setActiveDateField("scheduled");
											}}
										>
											Today
										</Button>
										<Button
											type="button"
											variant="outline"
											size="xs"
											onClick={() => {
												const d = new Date();
												d.setDate(d.getDate() + 1);
												setScheduledDate(todayIsoDateLocal(d));
												setActiveDateField("scheduled");
											}}
										>
											Tomorrow
										</Button>
										<Button
											type="button"
											variant="outline"
											size="xs"
											onClick={() => {
												const d = new Date();
												d.setDate(d.getDate() + 7);
												setScheduledDate(todayIsoDateLocal(d));
												setActiveDateField("scheduled");
											}}
										>
											Next week
										</Button>
										<Button
											type="button"
											size="xs"
											variant="ghost"
											onClick={() => updateActiveDate(undefined)}
										>
											Clear selected
										</Button>
									</div>
									<div className="tasksDateActions taskInlineDateActions">
										<Button
											type="button"
											variant="outline"
											size="icon-xs"
											title="Clear dates"
											aria-label="Clear dates"
											onClick={() => {
												setScheduledDate("");
												setDueDate("");
											}}
										>
											<Trash2 size={13} />
										</Button>
										<Button
											type="button"
											size="icon-xs"
											title="Apply dates"
											aria-label="Apply dates"
											onClick={() => {
												void applyTaskDates();
											}}
										>
											<Save size={13} />
										</Button>
										<Button
											type="button"
											variant="outline"
											size="icon-xs"
											title="Previous month"
											aria-label="Previous month"
											onClick={() =>
												setPickerMonth((current) => addMonths(current, -1))
											}
										>
											<HugeiconsIcon
												icon={ArrowLeft}
												size={13}
												strokeWidth={0.9}
											/>
										</Button>
										<Button
											type="button"
											variant="outline"
											size="icon-xs"
											title="Next month"
											aria-label="Next month"
											onClick={() =>
												setPickerMonth((current) => addMonths(current, 1))
											}
										>
											<HugeiconsIcon
												icon={ArrowRight}
												size={13}
												strokeWidth={0.9}
											/>
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="icon-xs"
											title="Close"
											aria-label="Close"
											onClick={() => setScheduleAnchor(null)}
										>
											<X size={13} />
										</Button>
									</div>
								</PopoverContent>
							</Popover>
						) : null}
						{showBacklinks && backlinks.length > 0 ? (
							<div className="editorBacklinks" aria-label="Backlinks">
								<div className="editorBacklinksRow">
									<div className="editorBacklinksLabel">
										Linked mentions ({backlinks.length})
									</div>
									{backlinks.map((item) => (
										<button
											key={item.id}
											type="button"
											className="editorBacklinkInline"
											onClick={() =>
												dispatchWikiLinkClick({
													raw: `[[${item.id}]]`,
													target: item.id,
													alias: null,
													anchorKind: "none",
													anchor: null,
													unresolved: false,
												})
											}
										>
											{item.title || item.id}
										</button>
									))}
								</div>
							</div>
						) : null}
					</div>
				) : null}
			</div>
		</div>
	);
});
