import {
	CodeIcon,
	EyeIcon,
	PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";
import type { EditorViewMode } from "../../lib/editorMode";

interface EditorViewModeSwitchProps {
	mode: EditorViewMode;
	onModeChange: (mode: EditorViewMode) => void;
	largeNote?: boolean;
}

export function EditorViewModeSwitch({
	mode,
	onModeChange,
	largeNote = false,
}: EditorViewModeSwitchProps) {
	const { t } = useTranslation("ui");
	const viewModes = [
		{ id: "plain" as const, label: t("editorMode.raw"), icon: CodeIcon },
		{
			id: "rich" as const,
			label: t("editorMode.rich"),
			icon: PencilEdit02Icon,
		},
		{ id: "preview" as const, label: t("editorMode.preview"), icon: EyeIcon },
	] as const;
	return (
		<div
			className="markdownEditorModeSwitch"
			role="toolbar"
			aria-label={t("editorMode.toolbar")}
		>
			{viewModes.map((item) => {
				const showLargeNoteHint = largeNote && item.id !== "plain";
				const hint = showLargeNoteHint
					? t("editorMode.largeNoteHint")
					: item.label;

				return (
					<span
						key={item.id}
						className="markdownEditorModeBtnWrap"
						data-caution={showLargeNoteHint || undefined}
					>
						<button
							type="button"
							className="markdownEditorModeBtn"
							aria-pressed={mode === item.id}
							aria-label={item.label}
							data-active={mode === item.id || undefined}
							onClick={() => onModeChange(item.id)}
						>
							<HugeiconsIcon
								icon={item.icon}
								size="var(--icon-md)"
								strokeWidth={0.9}
							/>
						</button>
						<span
							className="markdownEditorModeBtnHint"
							data-warning={showLargeNoteHint || undefined}
							role="tooltip"
						>
							{hint}
						</span>
					</span>
				);
			})}
		</div>
	);
}
