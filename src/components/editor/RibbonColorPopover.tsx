import { PaintBucketIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Editor } from "@tiptap/core";
import { m } from "motion/react";
import { X } from "../Icons";
import { springPresets } from "../ui/animations";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";
import { getTextColorButton } from "./ribbonButtonConfigs";

interface RibbonColorPopoverProps {
	editor: Editor;
	canEdit: boolean;
	runCommand: (fn: () => void) => void;
	focusChain: () => ReturnType<Editor["chain"]>;
	preventMouseDown: (e: React.MouseEvent) => void;
}

export function RibbonColorPopover({
	editor,
	canEdit,
	runCommand,
	focusChain,
	preventMouseDown,
}: RibbonColorPopoverProps) {
	const button = getTextColorButton(editor, runCommand, focusChain);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<m.button
					type="button"
					className={`ribbonBtn ${button.isActive?.() ? "active" : ""}`}
					title={button.title}
					disabled={!canEdit}
					onMouseDown={preventMouseDown}
					whileTap={canEdit ? { scale: 0.97 } : undefined}
					transition={springPresets.snappy}
				>
					<HugeiconsIcon icon={PaintBucketIcon} size={14} strokeWidth={0.9} />
				</m.button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				side="top"
				sideOffset={6}
				className="editorColorDropdown"
				onCloseAutoFocus={(event) => event.preventDefault()}
			>
				<div className="editorColorGrid" role="menu" aria-label="Text color">
					{button.options.map((option) => (
						<button
							key={option.id}
							type="button"
							className={`editorColorSwatchButton ${
								button.activeColor === option.id ? "active" : ""
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
						title="Clear color"
						aria-label="Clear color"
						onMouseDown={preventMouseDown}
						onClick={button.onClear}
					>
						<X size={12} />
					</button>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
