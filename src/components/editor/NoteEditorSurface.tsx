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
import { memo } from "react";
import type { BacklinkItem } from "../../lib/tauri";
import { Button } from "../ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { NoteSelectionOverlay } from "./NoteSelectionOverlay";
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

interface NoteEditorSurfaceProps {
	editor: Editor | null;
	mode: "rich" | "preview" | "plain";
	colorfulHeadings: boolean;
	canEdit: boolean;
	hostRef: (node: HTMLDivElement | null) => void;

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
		copied: boolean;
		onPickerMouseDown: (event: React.MouseEvent<HTMLElement>) => void;
		onApplyLanguage: (language: SupportedCodeBlockLanguage) => void;
		onCopy: () => void;
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
	colorfulHeadings,
	canEdit,
	hostRef,
	selectionRibbon,
	onExtractSelectionToNote,
	table,
	codeBlock,
	task,
	backlinks,
}: NoteEditorSurfaceProps) {
	const hostClassName = [
		"tiptapHostInline",
		mode === "preview" ? "is-preview" : "",
		"nodrag",
		"nopan",
		"nowheel",
	]
		.filter(Boolean)
		.join(" ");

	return (
		<NoteSelectionOverlay
			editor={editor}
			canEdit={canEdit}
			highlightEnabled={canEdit && mode === "rich"}
			selectionRibbon={selectionRibbon}
			onExtractSelectionToNote={onExtractSelectionToNote}
			hostRef={hostRef}
			className={hostClassName}
			colorfulHeadings={mode === "rich" && colorfulHeadings}
		>
			<EditorContent editor={editor} />
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
							size="var(--icon-md)"
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
							size="var(--icon-md)"
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
								aria-label="Set code block language"
							>
								<span className="codeBlockLanguageBtnIcon" aria-hidden>
									<HugeiconsIcon
										icon={SourceCodeIcon}
										size="var(--icon-sm)"
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
					aria-label={codeBlock.copied ? "Copied code" : "Copy code"}
				>
					<HugeiconsIcon
						icon={codeBlock.copied ? Tick02Icon : Copy01Icon}
						size="var(--icon-sm)"
						strokeWidth={0.9}
					/>
				</button>
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
							aria-label="Schedule selected task"
						>
							<HugeiconsIcon
								icon={Calendar03Icon}
								size="var(--icon-sm)"
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
										task.onScheduledDateChange(event.currentTarget.value);
									}}
									onBlur={(event) =>
										task.onUpdateDates(event.currentTarget.value, task.dueDate)
									}
									onKeyDown={(event) => {
										if (event.key !== "Enter") return;
										event.preventDefault();
										task.onUpdateDates(event.currentTarget.value, task.dueDate);
									}}
									aria-label="Scheduled date"
								/>
							</label>
							<label className="tasksDateNativeField">
								<span className="tasksDateFieldLabel">due</span>
								<input
									type="date"
									value={task.dueDate}
									onChange={(event) => {
										task.onDueDateChange(event.currentTarget.value);
									}}
									onBlur={(event) =>
										task.onUpdateDates(
											task.scheduledDate,
											event.currentTarget.value,
										)
									}
									onKeyDown={(event) => {
										if (event.key !== "Enter") return;
										event.preventDefault();
										task.onUpdateDates(
											task.scheduledDate,
											event.currentTarget.value,
										);
									}}
									aria-label="Due date"
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
		</NoteSelectionOverlay>
	);
});
