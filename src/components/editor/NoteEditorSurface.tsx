import {
	Calendar03Icon,
	Copy01Icon,
	LocationAdd01Icon,
	SourceCodeIcon,
	Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import DOMPurify from "dompurify";
import { AnimatePresence } from "motion/react";
import { memo, useEffect, useRef, useState } from "react";
import {
	extractMermaidErrorMessage,
	renderMermaidDiagram,
} from "../../lib/mermaid";
import type { BacklinkItem } from "../../lib/tauri";
import { Button } from "../ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { EditorRibbon } from "./EditorRibbon";
import {
	CODE_BLOCK_LANGUAGE_OPTIONS,
	type SupportedCodeBlockLanguage,
} from "./extensions/codeBlockHighlighting";
import { dispatchWikiLinkClick } from "./markdown/editorEvents";
import type {
	SelectedCodeBlockState,
	SelectedTableState,
	SelectionRibbonPosition,
} from "./noteEditorOverlayTypes";

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

export interface NoteEditorSurfaceProps {
	editor: Editor | null;
	mode: "rich" | "preview" | "plain";
	zenModeActive: boolean;
	editorFocused: boolean;
	colorfulHeadings: boolean;
	canEdit: boolean;
	hostRef: (node: HTMLDivElement | null) => void;
	onPointerDownCapture: (event: React.PointerEvent<HTMLDivElement>) => void;

	selectionRibbon: SelectionRibbonPosition | null;
	onExtractSelectionToNote?: () => void;

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
		scheduledDate: string;
		dueDate: string;
		onScheduledDateChange: (date: string) => void;
		onDueDateChange: (date: string) => void;
		onResetDraftDates: () => void;
		onUpdateDates: (scheduled: string, due: string) => void;
	};

	backlinks: {
		show: boolean;
		items: BacklinkItem[];
		interactive: boolean;
	};
}

export const NoteEditorSurface = memo(function NoteEditorSurface({
	editor,
	mode,
	zenModeActive,
	editorFocused,
	colorfulHeadings,
	canEdit,
	hostRef,
	onPointerDownCapture,
	selectionRibbon,
	onExtractSelectionToNote,
	table,
	codeBlock,
	task,
	backlinks,
}: NoteEditorSurfaceProps) {
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
						onExtractSelectionToNote={onExtractSelectionToNote}
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
						if (!open) {
							task.onResetDraftDates();
							task.onScheduleAnchorChange(null);
						}
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
					>
						<div className="tasksDateNativeFields">
							<label className="tasksDateNativeField">
								<span className="tasksDateFieldLabel">scheduled</span>
								<input
									type="date"
									value={task.scheduledDate}
									onChange={(event) => {
										const scheduled = event.currentTarget.value;
										task.onScheduledDateChange(scheduled);
										task.onUpdateDates(scheduled, task.dueDate);
									}}
								/>
							</label>
							<label className="tasksDateNativeField">
								<span className="tasksDateFieldLabel">due</span>
								<input
									type="date"
									value={task.dueDate}
									onChange={(event) => {
										const due = event.currentTarget.value;
										task.onDueDateChange(due);
										task.onUpdateDates(task.scheduledDate, due);
									}}
								/>
							</label>
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
									className="wikiLink"
									data-target={item.id}
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
									<span className="wikiLinkIcon" aria-hidden="true" />
									{item.title || item.id}
								</button>
							) : (
								<span
									key={item.id}
									className="wikiLink"
									data-target={item.id}
									aria-disabled
								>
									<span className="wikiLinkIcon" aria-hidden="true" />
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
