import {
	ArrowLeft,
	ArrowRight,
	Calendar03Icon,
	Copy01Icon,
	LocationAdd01Icon,
	SourceCodeIcon,
	Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { addMonths } from "date-fns";
import DOMPurify from "dompurify";
import { AnimatePresence } from "motion/react";
import { memo, useEffect, useRef, useState } from "react";
import {
	extractMermaidErrorMessage,
	renderMermaidDiagram,
} from "../../lib/mermaid";
import { todayIsoDateLocal } from "../../lib/tasks";
import type { BacklinkItem } from "../../lib/tauri";
import { Save, Trash2, X } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { Calendar as DateCalendar } from "../ui/shadcn/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import type {
	SelectedCodeBlockState,
	SelectedTableState,
	SelectionRibbonPosition,
} from "./CanvasNoteInlineEditor";
import { EditorRibbon } from "./EditorRibbon";
import {
	CODE_BLOCK_LANGUAGE_OPTIONS,
	type SupportedCodeBlockLanguage,
} from "./extensions/codeBlockHighlighting";
import { dispatchWikiLinkClick } from "./markdown/editorEvents";

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

		const sanitizedSvg = DOMPurify.sanitize(svg, {
			USE_PROFILES: { svg: true, svgFilters: true },
			FORBID_TAGS: ["foreignObject", "script"],
		});
		if (typeof sanitizedSvg !== "string" || !sanitizedSvg.trim()) {
			setError("Unable to render Mermaid diagram.");
			setSvg("");
			return;
		}
		const doc = new DOMParser().parseFromString(sanitizedSvg, "image/svg+xml");
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

export interface CanvasNoteEditorSurfaceProps {
	editor: Editor | null;
	mode: "rich" | "preview" | "plain";
	zenModeActive: boolean;
	editorFocused: boolean;
	colorfulHeadings: boolean;
	canEdit: boolean;
	hostRef: (node: HTMLDivElement | null) => void;
	onPointerDownCapture: (event: React.PointerEvent<HTMLDivElement>) => void;

	selectionRibbon: SelectionRibbonPosition | null;

	table: {
		selected: SelectedTableState | null;
		onControlMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
		onAddRow: () => void;
		onAddColumn: () => void;
	};

	codeBlock: {
		selected: SelectedCodeBlockState | null;
		pickerOpen: boolean;
		onPickerOpenChange: (open: boolean) => void;
		language: SupportedCodeBlockLanguage | null;
		languageLabel: string;
		isMermaid: boolean;
		isMermaidPreviewActive: boolean;
		copied: boolean;
		onPickerMouseDown: (event: React.MouseEvent<HTMLElement>) => void;
		onApplyLanguage: (language: SupportedCodeBlockLanguage) => void;
		onToggleMermaidPreview: () => void;
		onCopy: () => void;
		mermaidPreviewHeight: number;
		onMermaidHeightChange: (height: number) => void;
	};

	task: {
		selectedAnchor: { left: number; ordinal: number; top: number } | null;
		scheduleAnchor: { left: number; ordinal: number; top: number } | null;
		onScheduleAnchorChange: (
			anchor: { left: number; ordinal: number; top: number } | null,
		) => void;
		onOpenPopover: (anchor: {
			left: number;
			ordinal: number;
			top: number;
		}) => void;
		activeDateField: "scheduled" | "due";
		onActiveDateFieldChange: (field: "scheduled" | "due") => void;
		onFocusDateField: (field: "scheduled" | "due") => void;
		pickerMonth: Date;
		onPickerMonthChange: (date: Date | ((prev: Date) => Date)) => void;
		scheduledDate: string;
		dueDate: string;
		onScheduledDateChange: (date: string) => void;
		onDueDateChange: (date: string) => void;
		onApplyDates: () => void;
		onClearDates: () => void;
		activeDate: Date | undefined;
		onActiveDateChange: (date?: Date) => void;
		formatPickerValue: (value: string) => string;
	};

	backlinks: {
		show: boolean;
		items: BacklinkItem[];
		interactive: boolean;
	};
}

export const CanvasNoteEditorSurface = memo(function CanvasNoteEditorSurface({
	editor,
	mode,
	zenModeActive,
	editorFocused,
	colorfulHeadings,
	canEdit,
	hostRef,
	onPointerDownCapture,
	selectionRibbon,
	table,
	codeBlock,
	task,
	backlinks,
}: CanvasNoteEditorSurfaceProps) {
	return (
		<div
			ref={hostRef}
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
			data-colorful-headings={
				mode === "rich" && colorfulHeadings ? "true" : undefined
			}
			onPointerDownCapture={onPointerDownCapture}
		>
			<EditorContent editor={editor} />
			<AnimatePresence initial={false}>
				{canEdit && selectionRibbon && editor ? (
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
			{canEdit && table.selected ? (
				<>
					<button
						type="button"
						className="tableInlineAddBtn is-row"
						data-axis="row"
						aria-label="Add row"
						title="Add row"
						style={{
							left: `${table.selected.rowControlLeft}px`,
							top: `${table.selected.rowControlTop}px`,
						}}
						onMouseDown={table.onControlMouseDown}
						onClick={table.onAddRow}
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
							left: `${table.selected.columnControlLeft}px`,
							top: `${table.selected.columnControlTop}px`,
						}}
						onMouseDown={table.onControlMouseDown}
						onClick={table.onAddColumn}
					>
						<HugeiconsIcon
							icon={LocationAdd01Icon}
							size={14}
							strokeWidth={0.9}
						/>
					</button>
				</>
			) : null}
			{canEdit && codeBlock.selected ? (
				<div
					className="codeBlockInlineControls"
					style={{
						top: `${codeBlock.selected.top}px`,
						left: `${codeBlock.selected.controlsLeft}px`,
					}}
				>
					<Popover
						open={codeBlock.pickerOpen}
						onOpenChange={codeBlock.onPickerOpenChange}
					>
						<PopoverTrigger asChild>
							<button
								type="button"
								className="codeBlockLanguageBtn"
								onMouseDown={codeBlock.onPickerMouseDown}
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
									{codeBlock.languageLabel}
								</span>
							</button>
						</PopoverTrigger>
						<PopoverContent className="codeBlockLanguagePopover" align="start">
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
											option.value === codeBlock.language
												? "secondary"
												: "ghost"
										}
										className="codeBlockLanguageOption"
										onMouseDown={codeBlock.onPickerMouseDown}
										onClick={() => codeBlock.onApplyLanguage(option.value)}
									>
										{option.label}
									</Button>
								))}
							</div>
						</PopoverContent>
					</Popover>
					{codeBlock.isMermaid ? (
						<button
							type="button"
							className="codeBlockPreviewBtn"
							onMouseDown={codeBlock.onPickerMouseDown}
							onClick={codeBlock.onToggleMermaidPreview}
							title={
								codeBlock.isMermaidPreviewActive
									? "Stop Mermaid preview"
									: "Play Mermaid preview"
							}
						>
							<span className="codeBlockPreviewBtnLabel mono">
								{codeBlock.isMermaidPreviewActive ? "Stop" : "Play"}
							</span>
						</button>
					) : null}
				</div>
			) : null}
			{canEdit && codeBlock.selected ? (
				<button
					type="button"
					className="codeBlockCopyBtn"
					data-copied={codeBlock.copied || undefined}
					style={{
						top: `${codeBlock.selected.top}px`,
						left: `${codeBlock.selected.controlsRight}px`,
					}}
					onMouseDown={codeBlock.onPickerMouseDown}
					onClick={codeBlock.onCopy}
					title={codeBlock.copied ? "Copied!" : "Copy code to clipboard"}
				>
					<HugeiconsIcon
						icon={codeBlock.copied ? Tick02Icon : Copy01Icon}
						size={12}
						strokeWidth={0.9}
					/>
				</button>
			) : null}
			{canEdit && codeBlock.selected && codeBlock.isMermaidPreviewActive ? (
				<MermaidPreviewPanel
					source={codeBlock.selected.source}
					style={{
						top: `${codeBlock.selected.previewTop}px`,
						left: `${codeBlock.selected.previewLeft}px`,
						width: `${codeBlock.selected.width}px`,
					}}
					onHeightChange={codeBlock.onMermaidHeightChange}
				/>
			) : null}
			{canEdit && task.selectedAnchor ? (
				<Popover
					open={task.scheduleAnchor?.ordinal === task.selectedAnchor.ordinal}
					onOpenChange={(open) => {
						if (!open) task.onScheduleAnchorChange(null);
					}}
				>
					<PopoverTrigger asChild>
						<button
							type="button"
							className="taskInlineDateBtn"
							style={{
								top: `${task.selectedAnchor.top}px`,
								left: `${task.selectedAnchor.left}px`,
							}}
							onClick={() => {
								if (!task.selectedAnchor) return;
								void task.onOpenPopover(task.selectedAnchor);
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
								data-active={task.activeDateField === "scheduled"}
								onClick={() => task.onFocusDateField("scheduled")}
							>
								<span className="tasksDateFieldLabel">Scheduled</span>
								<span
									className="tasksDateFieldValue"
									data-empty={!task.scheduledDate}
								>
									{task.formatPickerValue(task.scheduledDate)}
								</span>
							</button>
							<button
								type="button"
								className="tasksDateFieldCard"
								data-active={task.activeDateField === "due"}
								onClick={() => task.onFocusDateField("due")}
							>
								<span className="tasksDateFieldLabel">Due</span>
								<span
									className="tasksDateFieldValue"
									data-empty={!task.dueDate}
								>
									{task.formatPickerValue(task.dueDate)}
								</span>
							</button>
						</div>
						<div className="tasksDatePickerShell">
							<DateCalendar
								mode="single"
								selected={task.activeDate}
								onSelect={task.onActiveDateChange}
								month={task.pickerMonth}
								onMonthChange={task.onPickerMonthChange}
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
									task.onScheduledDateChange(todayIsoDateLocal(d));
									task.onActiveDateFieldChange("scheduled");
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
									task.onScheduledDateChange(todayIsoDateLocal(d));
									task.onActiveDateFieldChange("scheduled");
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
									task.onScheduledDateChange(todayIsoDateLocal(d));
									task.onActiveDateFieldChange("scheduled");
								}}
							>
								Next week
							</Button>
							<Button
								type="button"
								size="xs"
								variant="ghost"
								onClick={() => task.onActiveDateChange(undefined)}
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
								onClick={task.onClearDates}
							>
								<Trash2 size={13} />
							</Button>
							<Button
								type="button"
								size="icon-xs"
								title="Apply dates"
								aria-label="Apply dates"
								onClick={() => {
									void task.onApplyDates();
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
									task.onPickerMonthChange((current) => addMonths(current, -1))
								}
							>
								<HugeiconsIcon icon={ArrowLeft} size={13} strokeWidth={0.9} />
							</Button>
							<Button
								type="button"
								variant="outline"
								size="icon-xs"
								title="Next month"
								aria-label="Next month"
								onClick={() =>
									task.onPickerMonthChange((current) => addMonths(current, 1))
								}
							>
								<HugeiconsIcon icon={ArrowRight} size={13} strokeWidth={0.9} />
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								title="Close"
								aria-label="Close"
								onClick={() => task.onScheduleAnchorChange(null)}
							>
								<X size={13} />
							</Button>
						</div>
					</PopoverContent>
				</Popover>
			) : null}
			{backlinks.show && backlinks.items.length > 0 ? (
				<div className="editorBacklinks" aria-label="Backlinks">
					<div className="editorBacklinksRow">
						<div className="editorBacklinksLabel">
							Linked mentions ({backlinks.items.length})
						</div>
						{backlinks.items.map((item) =>
							backlinks.interactive ? (
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
							) : (
								<span
									key={item.id}
									className="editorBacklinkInline"
									aria-disabled
								>
									{item.title || item.id}
								</span>
							),
						)}
					</div>
				</div>
			) : null}
		</div>
	);
});
