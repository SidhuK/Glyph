import { Copy01Icon, PlayIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { TableInlineControls } from "./TableInlineControls";
import {
	type SupportedCodeBlockLanguage,
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
		language: SupportedCodeBlockLanguage | null;
		copied: boolean;
		onCodeBlockActionMouseDown: (event: React.MouseEvent<HTMLElement>) => void;
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
					<select
						className="codeBlockLanguageSelect mono"
						value={codeBlock.language ?? "plaintext"}
						onChange={(event) => {
							const option = languageOptions.find(
								(candidate) => candidate.value === event.currentTarget.value,
							);
							if (option) codeBlock.onApplyLanguage(option.value);
						}}
						aria-label={t("codeBlock.setLanguage")}
					>
						{languageOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
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
							onMouseDown={codeBlock.onCodeBlockActionMouseDown}
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
						onMouseDown={codeBlock.onCodeBlockActionMouseDown}
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
