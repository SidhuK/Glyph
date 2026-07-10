import {
	Copy01Icon,
	PlayIcon,
	SourceCodeIcon,
	Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { TableInlineControls } from "./TableInlineControls";
import {
	type SupportedCodeBlockLanguage,
	getCodeBlockLanguageLabel,
	getCodeBlockLanguageOptions,
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
		copied: boolean;
		onPickerMouseDown: (event: React.MouseEvent<HTMLElement>) => void;
		onApplyLanguage: (language: SupportedCodeBlockLanguage) => void;
		onCopy: () => void;
		canPreview: boolean;
		onPreview: () => void;
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
	const { t } = useTranslation("editor");
	const languageOptions = getCodeBlockLanguageOptions();
	const languageLabel = getCodeBlockLanguageLabel(
		codeBlock.selected?.language ?? codeBlock.language,
	);
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
								title={t("codeBlock.setLanguage")}
								aria-label={t("codeBlock.setLanguage")}
							>
								<span className="codeBlockLanguageBtnIcon" aria-hidden>
									<HugeiconsIcon
										icon={SourceCodeIcon}
										size="var(--icon-sm)"
										strokeWidth={0.9}
									/>
								</span>
								<span className="codeBlockLanguageBtnLabel mono">
									{languageLabel}
								</span>
							</button>
						</PopoverTrigger>
						<PopoverContent className="codeBlockLanguagePopover" align="start">
							<div className="codeBlockLanguagePopoverHeader">
								{t("codeBlock.languageHeader")}
							</div>
							<div className="codeBlockLanguageOptions">
								{languageOptions.map((option) => (
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
				<div
					className="codeBlockActionBtns"
					style={{
						top: `${codeBlock.selected.top}px`,
						left: `${codeBlock.selected.controlsRight}px`,
					}}
				>
					{codeBlock.canPreview ? (
						<button
							type="button"
							className="codeBlockActionBtn"
							onMouseDown={codeBlock.onPickerMouseDown}
							onClick={codeBlock.onPreview}
							title={t("codeBlock.runPreview")}
							aria-label={t("codeBlock.runPreview")}
						>
							<HugeiconsIcon
								icon={PlayIcon}
								size="var(--icon-sm)"
								strokeWidth={0.9}
							/>
						</button>
					) : null}
					<button
						type="button"
						className="codeBlockActionBtn"
						data-copied={codeBlock.copied || undefined}
						onMouseDown={codeBlock.onPickerMouseDown}
						onClick={codeBlock.onCopy}
						title={
							codeBlock.copied ? t("codeBlock.copied") : t("codeBlock.copy")
						}
						aria-label={
							codeBlock.copied ? t("codeBlock.copied") : t("codeBlock.copy")
						}
					>
						<HugeiconsIcon
							icon={codeBlock.copied ? Tick02Icon : Copy01Icon}
							size="var(--icon-sm)"
							strokeWidth={0.9}
						/>
					</button>
				</div>
			) : null}
		</div>
	);
});
