import { EditorContent } from "@tiptap/react";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { joinYamlFrontmatter } from "../../lib/notePreview";
import { type BacklinkItem, invoke } from "../../lib/tauri";
import { ChevronDown, ChevronRight } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { EditorRibbon } from "./EditorRibbon";
import { useNoteEditor } from "./hooks/useNoteEditor";
import { dispatchWikiLinkClick } from "./markdown/editorEvents";
import { getTaskDatesByOrdinal, updateTaskLineByOrdinal } from "./taskMetadata";
import type { CanvasNoteInlineEditorProps } from "./types";

function normalizeBody(markdown: string): string {
	return markdown.replace(/\u00a0/g, " ").replace(/&nbsp;/g, " ");
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
	} = useNoteEditor({ markdown, mode, onChange });

	const [frontmatterDraft, setFrontmatterDraft] = useState(frontmatter ?? "");
	const frontmatterTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
	const lastFrontmatterRef = useRef(frontmatter);
	const [frontmatterExpanded, setFrontmatterExpanded] = useState(false);
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

	useEffect(() => {
		if (frontmatter === lastFrontmatterRef.current) return;
		lastFrontmatterRef.current = frontmatter;
		setFrontmatterDraft(frontmatter ?? "");
	}, [frontmatter]);

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

	// biome-ignore lint/correctness/useExhaustiveDependencies: resize on draft change
	useLayoutEffect(() => {
		if (mode !== "rich") return;
		const el = frontmatterTextAreaRef.current;
		if (!el) return;
		el.style.height = "0px";
		el.style.height = `${el.scrollHeight}px`;
	}, [frontmatterDraft, mode]);

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

	const handleFrontmatterChange = (
		event: React.ChangeEvent<HTMLTextAreaElement>,
	) => {
		const next = event.target.value;
		setFrontmatterDraft(next);
		const normalizedFrontmatter = next.trim().length ? next : null;
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

	const openTaskPopover = (anchor: { ordinal: number; top: number }) => {
		setScheduleAnchor(anchor);
		const existing = getTaskDatesByOrdinal(markdown, anchor.ordinal);
		setScheduledDate(existing?.scheduledDate ?? "");
		setDueDate(existing?.dueDate ?? "");
	};
	const applyTaskDates = () => {
		if (!scheduleAnchor) return;
		const next = updateTaskLineByOrdinal(
			markdown,
			scheduleAnchor.ordinal,
			scheduledDate,
			dueDate,
		);
		if (!next) return;
		onChange(next);
		setScheduleAnchor(null);
	};

	return (
		<div
			className={[
				"rfNodeNoteEditor",
				"nodrag",
				"nopan",
				editor && mode === "rich" ? "hasRibbon" : "",
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
				{mode === "rich" ? (
					<div className="frontmatterPreview frontmatterPreviewInteractive mono">
						<button
							type="button"
							className="frontmatterToggle"
							aria-expanded={frontmatterExpanded}
							onClick={() => setFrontmatterExpanded((prev) => !prev)}
						>
							{frontmatterExpanded ? (
								<ChevronDown size={12} />
							) : (
								<ChevronRight size={12} />
							)}
							<div className="frontmatterLabel">Frontmatter</div>
						</button>
						{frontmatterExpanded ? (
							<textarea
								ref={frontmatterTextAreaRef}
								className="frontmatterEditor"
								value={frontmatterDraft}
								onChange={handleFrontmatterChange}
								placeholder="---\ntitle: Untitled\n---"
								spellCheck={false}
							/>
						) : null}
					</div>
				) : frontmatter ? (
					<div className="frontmatterPreview mono">
						<div className="frontmatterLabel">Frontmatter</div>
						<pre>{frontmatter.trimEnd()}</pre>
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
										onClick={() => openTaskPopover(selectedTaskAnchor)}
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
										<Button type="button" size="xs" onClick={applyTaskDates}>
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
