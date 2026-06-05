import type { CSSProperties } from "react";
import { databaseValueToneStyleForColor } from "../../lib/database/palette";
import type { FileTreeAppearance } from "../../lib/tauri";
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
	size = 14,
}: {
	notePath: string;
	appearance?: FileTreeAppearance | null;
	className?: string;
	size?: number;
}) {
	const { Icon, color } = getFileTypeInfo(notePath, isMarkdownPath(notePath));

	if (appearance?.icon) {
		return (
			<DatabaseColumnIcon
				iconName={appearance.icon}
				size={size}
				className={className}
			/>
		);
	}

	return (
		<Icon
			size={size}
			className={className}
			style={{ color: `var(--database-note-appearance-color, ${color})` }}
			aria-hidden="true"
		/>
	);
}
