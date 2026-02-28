import { openUrl } from "@tauri-apps/plugin-opener";
import { EditorContent } from "@tiptap/react";
import { memo, useEffect, useRef, useState } from "react";
import { joinYamlFrontmatter } from "../../lib/notePreview";
import { type BacklinkItem, invoke } from "../../lib/tauri";
import { Button } from "../ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { EditorRibbon } from "./EditorRibbon";
import { NotePropertiesPanel } from "./NotePropertiesPanel";
import { useNoteEditor } from "./hooks/useNoteEditor";
import {
	dispatchMarkdownLinkClick,
	dispatchWikiLinkClick,
} from "./markdown/editorEvents";
import { parseWikiLink } from "./markdown/wikiLinkCodec";
import type { CanvasNoteInlineEditorProps } from "./types";

function normalizeBody(markdown: string): string {
	return markdown.replace(/\u00a0/g, " ").replace(/&nbsp;/g, " ");
}

type FrontmatterLinkToken =
	| { kind: "wiki"; raw: string; start: number; end: number }
	| { kind: "href"; raw: string; href: string; start: number; end: number };

const FRONTMATTER_LINK_PATTERN =
	/!?\[\[[^\]\n]+\]\]|\[[^\]\n]+\]\((?:\\.|[^)\n])+\)|https?:\/\/[^\s<>"')\]]+/g;
const RIBBON_HOVER_ZONE_PX = 72;

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
	if (href.startsWith("#")) return;
	dispatchMarkdownLinkClick({ href, sourcePath });
}

export const CanvasNoteInlineEditor = memo(function CanvasNoteInlineEditor({
	markdown,
	relPath,
	mode,
	onRegisterCalloutInserter,
	onChange,
}: CanvasNoteInlineEditorProps) {
	const {
		editor,
		frontmatter,
		frontmatterRef,
		lastAppliedBodyRef,
		lastEmittedMarkdownRef,
	} = useNoteEditor({ markdown, mode, relPath, onChange });

	const [frontmatterDraft, setFrontmatterDraft] = useState(frontmatter ?? "");
	const lastFrontmatterRef = useRef(frontmatter);
	const [backlinks, setBacklinks] = useState<BacklinkItem[]>([]);
	const tiptapHostRef = useRef<HTMLDivElement | null>(null);
	const [taskAnchors, setTaskAnchors] = useState<
		Array<{
			ordinal: number;
			top: number;
		}>
	>([]);
	const [selectedTaskOrdinal, setSelectedTaskOrdinal] = useState<number | null>(
		null,
	);
	const [scheduleAnchor, setScheduleAnchor] = useState<{
		ordinal: number;
		top: number;
	} | null>(null);
	const [scheduledDate, setScheduledDate] = useState("");
	const [dueDate, setDueDate] = useState("");
	const [showBottomRibbon, setShowBottomRibbon] = useState(false);

	useEffect(() => {
		if (frontmatter === lastFrontmatterRef.current) return;
		lastFrontmatterRef.current = frontmatter;
		setFrontmatterDraft(frontmatter ?? "");
	}, [frontmatter]);

	useEffect(() => {
		if (mode !== "rich") setShowBottomRibbon(false);
	}, [mode]);

	useEffect(() => {
		if (!relPath) {
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
	}, [relPath]);

	const canEdit = mode === "rich" && Boolean(editor?.isEditable);

	useEffect(() => {
		if (!onRegisterCalloutInserter) return;
		if (!editor || mode !== "rich") {
			onRegisterCalloutInserter(null);
			return;
		}
		onRegisterCalloutInserter((type: string) => {
			const normalizedType =
				type.toLowerCase() === "warn" ? "warning" : type.toLowerCase();
			const host = editor.view.dom.closest(
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
					<button
						key={`fm-${token.start}-${token.end}`}
						type="button"
						className="frontmatterInlineLink"
						onClick={() => {
							if (!parsed) return;
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
					</button>,
				);
			} else {
				nodes.push(
					<button
						key={`fm-${token.start}-${token.end}`}
						type="button"
						className="frontmatterInlineLink"
						onClick={() => {
							void openFrontmatterHref(token.href, relPath ?? "");
						}}
					>
						{token.raw}
					</button>,
				);
			}
			cursor = token.end;
		}
		if (cursor < text.length) nodes.push(text.slice(cursor));
		return nodes;
	};

	useEffect(() => {
		if (!editor || mode !== "rich") {
			setTaskAnchors([]);
			setSelectedTaskOrdinal(null);
			setScheduleAnchor(null);
			return;
		}
		const host = tiptapHostRef.current;
		if (!host) return;

		const syncAnchors = () => {
			const items = Array.from(
				host.querySelectorAll("li[data-type='taskItem'], li[data-checked]"),
			) as HTMLElement[];
			setTaskAnchors(
				items.map((item, ordinal) => ({ ordinal, top: item.offsetTop + 2 })),
			);
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
			if (!anchorElement || !host.contains(anchorElement)) {
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
				host.querySelectorAll("li[data-type='taskItem'], li[data-checked]"),
			) as HTMLElement[];
			const ordinal = items.indexOf(taskEl);
			setSelectedTaskOrdinal(ordinal >= 0 ? ordinal : null);
		};

		syncAnchors();
		syncSelectedTask();
		const observer = new MutationObserver(() => syncAnchors());
		observer.observe(host, {
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
	}, [editor, mode]);

	const selectedTaskAnchor =
		selectedTaskOrdinal == null
			? null
			: (taskAnchors.find((anchor) => anchor.ordinal === selectedTaskOrdinal) ??
				null);

	const openTaskPopover = async (anchor: { ordinal: number; top: number }) => {
		setScheduleAnchor(anchor);
		try {
			const existing = await invoke("task_dates_by_ordinal", {
				markdown,
				ordinal: anchor.ordinal,
			});
			setScheduledDate(existing?.scheduled_date ?? "");
			setDueDate(existing?.due_date ?? "");
		} catch {
			setScheduledDate("");
			setDueDate("");
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

	const updateRibbonVisibility = (
		event: React.PointerEvent<HTMLDivElement>,
	) => {
		if (mode !== "rich") return;
		const bounds = event.currentTarget.getBoundingClientRect();
		const shouldShow = bounds.bottom - event.clientY <= RIBBON_HOVER_ZONE_PX;
		setShowBottomRibbon((prev) => (prev === shouldShow ? prev : shouldShow));
	};

	return (
		<div
			className={[
				"rfNodeNoteEditor",
				"nodrag",
				"nopan",
				editor && mode === "rich" ? "hasRibbon" : "",
				showBottomRibbon ? "showRibbon" : "",
			]
				.filter(Boolean)
				.join(" ")}
			onPointerEnter={updateRibbonVisibility}
			onPointerMove={updateRibbonVisibility}
			onPointerLeave={() => setShowBottomRibbon(false)}
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
				{mode === "rich" && frontmatterDraft ? (
					<div className="frontmatterPreview mono">
						<NotePropertiesPanel
							frontmatter={frontmatterDraft}
							onChange={handleFrontmatterChange}
						/>
					</div>
				) : frontmatter ? (
					<div className="frontmatterPreview mono">
						<pre>{renderFrontmatterWithLinks(frontmatter.trimEnd())}</pre>
					</div>
				) : null}
				{mode !== "plain" && backlinks.length > 0 ? (
					<div className="editorBacklinks" aria-label="Backlinks">
						<div className="editorBacklinksLabel">
							Linked mentions ({backlinks.length})
						</div>
						<div className="editorBacklinksList">
							{backlinks.map((item) => (
								<button
									key={item.id}
									type="button"
									className="editorBacklink"
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
				{mode !== "plain" ? (
					<div
						ref={tiptapHostRef}
						className={[
							"tiptapHostInline",
							mode === "preview" ? "is-preview" : "",
							"nodrag",
							"nopan",
							"nowheel",
						]
							.filter(Boolean)
							.join(" ")}
					>
						<EditorContent editor={editor} />
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
										style={{ top: `${selectedTaskAnchor.top}px` }}
										onClick={() => {
											void openTaskPopover(selectedTaskAnchor);
										}}
										title="Schedule selected task"
									>
										<span className="taskInlineDateGlyph" aria-hidden>
											📅
										</span>
									</button>
								</PopoverTrigger>
								<PopoverContent
									className="taskInlineDatePopover"
									align="start"
									onInteractOutside={(event) => event.preventDefault()}
									onPointerDownOutside={(event) => event.preventDefault()}
								>
									<label>
										Scheduled
										<input
											type="date"
											value={scheduledDate}
											onChange={(event) => setScheduledDate(event.target.value)}
										/>
									</label>
									<label>
										Due
										<input
											type="date"
											value={dueDate}
											onChange={(event) => setDueDate(event.target.value)}
										/>
									</label>
									<div className="taskInlineDateActions">
										<Button
											type="button"
											size="xs"
											variant="ghost"
											onClick={() => setScheduleAnchor(null)}
										>
											Close
										</Button>
										<Button
											type="button"
											size="xs"
											variant="outline"
											onClick={() => {
												setScheduledDate("");
												setDueDate("");
											}}
										>
											Clear
										</Button>
										<Button
											type="button"
											size="xs"
											onClick={() => {
												void applyTaskDates();
											}}
										>
											Apply
										</Button>
									</div>
								</PopoverContent>
							</Popover>
						) : null}
					</div>
				) : null}
			</div>
			{editor && mode === "rich" ? (
				<EditorRibbon editor={editor} canEdit={canEdit} />
			) : null}
		</div>
	);
});
