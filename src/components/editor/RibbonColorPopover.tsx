import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { TextColorIcon } from "@hugeicons/core-free-icons";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { X } from "../Icons";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import {
	type RibbonSwatchGroup,
	getActiveTextColor,
	getActiveTextHighlight,
	getTextColorButton,
	getTextHighlightButton,
} from "./ribbonButtonConfigs";

interface RibbonColorPopoverProps {
	editor: Editor;
	canEdit: boolean;
	runCommand: (fn: () => void) => void;
	focusChain: () => ReturnType<Editor["chain"]>;
	preventMouseDown: (e: React.MouseEvent) => void;
}

/** The "A" without its baseline: the trigger draws that line itself, in the current text colour. */
const TEXT_COLOR_LETTER = TextColorIcon.filter(([, attrs]) => attrs.d !== "M3 21H21");

function SwatchSection({
	label,
	clearLabel,
	group,
	preventMouseDown,
}: {
	label: string;
	clearLabel: string;
	group: RibbonSwatchGroup;
	preventMouseDown: (e: React.MouseEvent) => void;
}) {
	return (
		<div className="editorColorSection">
			<div className="editorColorSectionLabel">{label}</div>
			<div className="editorColorGrid" role="menu" aria-label={group.title}>
				{group.options.map((option) => (
					<button
						key={option.id}
						type="button"
						className={`editorColorSwatchButton ${group.activeId === option.id ? "active" : ""}`}
						title={option.label}
						aria-label={option.label}
						onMouseDown={preventMouseDown}
						onClick={option.onSelect}
					>
						<span
							className="editorColorSwatch"
							style={{ color: `var(${option.cssVar}, ${option.fallbackHex})` }}
							aria-hidden
						/>
					</button>
				))}
				<button
					type="button"
					className="editorColorSwatchButton editorColorClearButton"
					title={clearLabel}
					aria-label={clearLabel}
					onMouseDown={preventMouseDown}
					onClick={group.onClear}
				>
					<X size="var(--icon-sm)" />
				</button>
			</div>
		</div>
	);
}

/** One colour button for text colour and highlight, with a section for each (Notion-style). */
export function RibbonColorPopover({
	editor,
	canEdit,
	runCommand,
	focusChain,
	preventMouseDown,
}: RibbonColorPopoverProps) {
	const { t } = useTranslation("editor");
	// Re-render on colour changes so the trigger's underline and the active swatch stay current.
	const activeColor = useEditorState({
		editor,
		selector: ({ editor: instance }) =>
			instance.isDestroyed ? null : getActiveTextColor(instance),
	});
	const activeHighlight = useEditorState({
		editor,
		selector: ({ editor: instance }) =>
			instance.isDestroyed ? null : getActiveTextHighlight(instance),
	});
	const textColor = getTextColorButton(editor, runCommand, focusChain);
	const highlight = getTextHighlightButton(editor, runCommand, focusChain);
	const activeColorOption = textColor.options.find((option) => option.id === activeColor);
	const label = t("ribbon.color");

	return (
		<Popover>
			<PopoverTrigger
				disabled={!canEdit}
				render={
					<button
						type="button"
						className={`ribbonBtn ribbonColorBtn ${activeColor || activeHighlight ? "active" : ""}`}
						title={label}
						aria-label={label}
						onMouseDown={preventMouseDown}
					/>
				}
			>
				<HugeiconsIcon icon={TEXT_COLOR_LETTER} size="var(--icon-md)" />
				<span
					className="ribbonColorUnderline"
					style={
						activeColorOption
							? {
									backgroundColor: `var(${activeColorOption.cssVar}, ${activeColorOption.fallbackHex})`,
								}
							: undefined
					}
					aria-hidden
				/>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="top"
				sideOffset={6}
				className="editorColorDropdown w-auto"
				finalFocus={false}
			>
				<SwatchSection
					label={t("ribbon.colorSections.text")}
					clearLabel={t("ribbon.clearColor")}
					group={textColor}
					preventMouseDown={preventMouseDown}
				/>
				<SwatchSection
					label={t("ribbon.colorSections.highlight")}
					clearLabel={t("ribbon.clearHighlight")}
					group={highlight}
					preventMouseDown={preventMouseDown}
				/>
			</PopoverContent>
		</Popover>
	);
}
