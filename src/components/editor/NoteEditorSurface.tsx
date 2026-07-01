import {
	Copy01Icon,
	SourceCodeIcon,
	Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { memo } from "react";
import { Button } from "../ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { TableInlineControls } from "./TableInlineControls";
import {
	CODE_BLOCK_LANGUAGE_OPTIONS,
	type SupportedCodeBlockLanguage,
} from "./extensions/codeBlockHighlighting";
import type {
	SelectedCodeBlockState,
	TableInlineControlsProps,
} from "./noteEditorOverlayTypes";

interface NoteEditorSurfaceProps {
	editor: Editor | null;
	mode: "rich" | "preview" | "plain";
	colorfulHeadings: boolean;
	canEdit: boolean;
	hostRef: (node: HTMLDivElement | null) => void;

	tableControls: TableInlineControlsProps | null;

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
}

export const NoteEditorSurface = memo(function NoteEditorSurface({
	editor,
	mode,
	colorfulHeadings,
	canEdit,
	hostRef,
	tableControls,
	codeBlock,
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
		<div
			ref={hostRef}
			className={hostClassName}
			data-colorful-headings={
				mode === "rich" && colorfulHeadings ? "true" : undefined
			}
		>
			<EditorContent editor={editor} />
			{canEdit && tableControls ? (
				<TableInlineControls {...tableControls} />
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
		</div>
	);
});
