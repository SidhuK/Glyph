import type { CSSProperties } from "react";
import { databaseValueToneStyleForColor } from "../../lib/database/palette";
import type { FileTreeAppearance } from "../../lib/tauri";
import { isMarkdownPath } from "../../utils/path";
import { isEditorTextColor } from "../editor/textColors";
import { getFileTypeInfo } from "../filetree/fileTypeUtils";
import { AppearanceIcon } from "../AppearanceIcon";

export function databaseNoteAppearanceStyle(
	notePath: string,
	appearance?: FileTreeAppearance | null,
): CSSProperties | undefined {
	const color = appearance?.color && isEditorTextColor(appearance.color) ? appearance.color : null;
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
	size = "var(--icon-md)",
}: {
	notePath: string;
	appearance?: FileTreeAppearance | null;
	className?: string;
	size?: string | number;
}) {
	const { Icon, color } = getFileTypeInfo(notePath, isMarkdownPath(notePath));

	if (appearance?.icon) {
		return <AppearanceIcon iconName={appearance.icon} size={size} className={className} />;
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
