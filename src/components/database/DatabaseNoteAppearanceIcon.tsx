import type { CSSProperties } from "react";
import { databaseValueToneStyleForColor } from "../../lib/database/palette";
import type { FileTreeAppearance } from "../../lib/tauri";
import { cn } from "../../lib/utils";
import { isMarkdownPath } from "../../utils/path";
import { isEditorTextColor } from "../editor/textColors";
import { getFileTypeInfo } from "../filetree/fileTypeUtils";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";

export function databaseNoteAppearanceStyle(
	notePath: string,
	appearance?: FileTreeAppearance | null,
): CSSProperties | undefined {
	const color =
		appearance?.color && isEditorTextColor(appearance.color)
			? appearance.color
			: null;
	if (!color) return undefined;
	return {
		...databaseValueToneStyleForColor(notePath, color),
		"--database-note-appearance-color": "var(--database-tone)",
	} as CSSProperties;
}

export function DatabaseNoteAppearanceIcon({
	notePath,
	appearance,
	className,
	size,
}: {
	notePath: string;
	appearance?: FileTreeAppearance | null;
	className?: string;
	size?: string | number;
}) {
	const { Icon, color } = getFileTypeInfo(notePath, isMarkdownPath(notePath));
	const iconClassName = cn(
		size === undefined && "size-[var(--icon-md)]",
		className,
	);

	if (appearance?.icon) {
		return (
			<DatabaseColumnIcon
				iconName={appearance.icon}
				size={size}
				className={iconClassName}
			/>
		);
	}

	return (
		<Icon
			size={size}
			className={iconClassName}
			style={{ color: `var(--database-note-appearance-color, ${color})` }}
			aria-hidden="true"
		/>
	);
}
