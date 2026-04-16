import { PaintBucketIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CSSProperties } from "react";
import { DATABASE_COLUMN_ICON_OPTIONS } from "../../lib/database/columnIcons";
import type { FileTreeAppearance } from "../../lib/tauri";
import { DatabaseColumnIcon } from "../database/DatabaseColumnIcon";
import {
	EDITOR_TEXT_COLORS,
	type EditorTextColor,
	isEditorTextColor,
} from "../editor/textColors";
import {
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "../ui/shadcn/context-menu";

interface FileTreeAppearanceMenuProps {
	itemKind: "dir" | "file";
	appearance?: FileTreeAppearance | null;
	onChangeAppearance: (appearance: FileTreeAppearance) => void;
}

function currentColor(
	appearance?: FileTreeAppearance | null,
): EditorTextColor | null {
	return appearance?.color && isEditorTextColor(appearance.color)
		? appearance.color
		: null;
}

export function FileTreeAppearanceMenu({
	itemKind,
	appearance,
	onChangeAppearance,
}: FileTreeAppearanceMenuProps) {
	const selectedColor = currentColor(appearance);
	const selectedIcon = appearance?.icon ?? null;

	return (
		<ContextMenuSub>
			<ContextMenuSubTrigger className="fileTreeCreateMenuItem">
				<HugeiconsIcon icon={PaintBucketIcon} size={14} strokeWidth={0.9} />
				Icon & Color
			</ContextMenuSubTrigger>
			<ContextMenuSubContent className="fileTreeCreateMenu fileTreeAppearanceMenuPanel fileTreeAppearanceIconPanel">
				<div className="databaseBoardColorRibbon fileTreeAppearanceColorRibbon">
					{EDITOR_TEXT_COLORS.map((color) => (
						<button
							key={color.id}
							type="button"
							className="databaseBoardColorRibbonSwatch"
							data-active={selectedColor === color.id ? "true" : "false"}
							style={
								{
									"--database-tone": `var(${color.cssVar}, ${color.fallbackHex})`,
								} as CSSProperties
							}
							onClick={() =>
								onChangeAppearance({
									color: color.id,
									icon: selectedIcon,
								})
							}
							title={color.label}
							aria-label={`Set color to ${color.label}`}
						/>
					))}
					<button
						type="button"
						className="databaseBoardColorRibbonClear"
						data-active={selectedColor === null ? "true" : "false"}
						onClick={() =>
							onChangeAppearance({
								color: null,
								icon: selectedIcon,
							})
						}
						title="Use default color"
						aria-label="Use default color"
					>
						<span />
					</button>
				</div>
				<ContextMenuSeparator className="fileTreeCreateMenuSeparator" />
				<div className="fileTreeAppearanceIconGrid">
					<button
						className="fileTreeAppearanceIconOption"
						type="button"
						data-active={selectedIcon === null ? "true" : "false"}
						onClick={() =>
							onChangeAppearance({
								color: selectedColor,
								icon: null,
							})
						}
						title="Default icon"
						aria-label="Default icon"
					>
						<span className="fileTreeAppearanceIconGlyph">
							<DatabaseColumnIcon
								iconName={itemKind === "dir" ? "folder" : "document"}
								size={16}
							/>
						</span>
					</button>
					{DATABASE_COLUMN_ICON_OPTIONS.map((option) => (
						<button
							key={option.id}
							type="button"
							className="fileTreeAppearanceIconOption"
							data-active={selectedIcon === option.id ? "true" : "false"}
							onClick={() =>
								onChangeAppearance({
									color: selectedColor,
									icon: option.id,
								})
							}
							title={option.label}
							aria-label={option.label}
						>
							<span className="fileTreeAppearanceIconGlyph">
								<DatabaseColumnIcon iconName={option.id} size={16} />
							</span>
						</button>
					))}
				</div>
			</ContextMenuSubContent>
		</ContextMenuSub>
	);
}
