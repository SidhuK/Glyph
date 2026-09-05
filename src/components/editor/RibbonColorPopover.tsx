import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { HighlighterIcon, PaintBucketIcon } from "@hugeicons/core-free-icons";
import type { Editor } from "@tiptap/core";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";
import { X } from "../Icons";
import { springPresets } from "../ui/animations";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";
import {
	getTextColorButton,
	getTextHighlightButton,
} from "./ribbonButtonConfigs";

interface RibbonSwatchPopoverProps {
	editor: Editor;
	canEdit: boolean;
	runCommand: (fn: () => void) => void;
	focusChain: () => ReturnType<Editor["chain"]>;
	preventMouseDown: (e: React.MouseEvent) => void;
}

function RibbonSwatchPopover({
	icon,
	menuLabel,
	clearLabel,
	button,
	canEdit,
	preventMouseDown,
}: {
	icon: typeof PaintBucketIcon;
	menuLabel: string;
	clearLabel: string;
	button: ReturnType<typeof getTextColorButton>;
	canEdit: boolean;
	preventMouseDown: (e: React.MouseEvent) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<m.button
					type="button"
					className={`ribbonBtn ${button.isActive?.() ? "active" : ""}`}
					title={button.title}
					aria-label={button.title}
					disabled={!canEdit}
					onMouseDown={preventMouseDown}
					whileTap={canEdit ? { scale: 0.97 } : undefined}
					transition={springPresets.snappy}
				>
					<HugeiconsIcon icon={icon} size="var(--icon-md)" />
				</m.button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				side="top"
				sideOffset={6}
				className="editorColorDropdown"
				onCloseAutoFocus={(event) => event.preventDefault()}
			>
				<div className="editorColorGrid" role="menu" aria-label={menuLabel}>
					{button.options.map((option) => (
						<button
							key={option.id}
							type="button"
							className={`editorColorSwatchButton ${
								button.activeId === option.id ? "active" : ""
							}`}
							title={option.label}
							aria-label={option.label}
							onMouseDown={preventMouseDown}
							onClick={option.onSelect}
						>
							<span
								className="editorColorSwatch"
								style={{
									backgroundColor: `var(${option.cssVar}, ${option.fallbackHex})`,
								}}
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
						onClick={button.onClear}
					>
						<X size="var(--icon-sm)" />
					</button>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function RibbonColorPopover({
	editor,
	canEdit,
	runCommand,
	focusChain,
	preventMouseDown,
}: RibbonSwatchPopoverProps) {
	const { t } = useTranslation("editor");
	return (
		<RibbonSwatchPopover
			icon={PaintBucketIcon}
			menuLabel={t("ribbon.textColor")}
			clearLabel={t("ribbon.clearColor")}
			button={getTextColorButton(editor, runCommand, focusChain)}
			canEdit={canEdit}
			preventMouseDown={preventMouseDown}
		/>
	);
}

export function RibbonHighlightPopover({
	editor,
	canEdit,
	runCommand,
	focusChain,
	preventMouseDown,
}: RibbonSwatchPopoverProps) {
	const { t } = useTranslation("editor");
	return (
		<RibbonSwatchPopover
			icon={HighlighterIcon}
			menuLabel={t("ribbon.textHighlight")}
			clearLabel={t("ribbon.clearHighlight")}
			button={getTextHighlightButton(editor, runCommand, focusChain)}
			canEdit={canEdit}
			preventMouseDown={preventMouseDown}
		/>
	);
}
