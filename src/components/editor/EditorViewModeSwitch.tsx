import {
	CodeIcon,
	EyeIcon,
	PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";
import type { EditorViewMode } from "../../lib/editorMode";

const VIEW_MODES = [
	{ id: "plain" as const, labelKey: "mode.raw" as const, icon: CodeIcon },
	{
		id: "rich" as const,
		labelKey: "mode.rich" as const,
		icon: PencilEdit02Icon,
	},
	{
		id: "preview" as const,
		labelKey: "mode.preview" as const,
		icon: EyeIcon,
	},
] as const;

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
	const { t } = useTranslation("editor");
	return (
		<div
			className="markdownEditorModeSwitch"
			role="toolbar"
			aria-label={t("mode.label")}
		>
			{VIEW_MODES.map((item) => {
				const label = t(item.labelKey);
				const isActive = mode === item.id;
				const showLargeNoteHint = largeNote && item.id !== "plain";
				const hint = showLargeNoteHint ? t("mode.largeNoteHint") : label;

				return (
					<span
						key={item.id}
						className="markdownEditorModeBtnWrap"
						data-caution={showLargeNoteHint || undefined}
					>
						<button
							type="button"
							className="markdownEditorModeBtn"
							aria-pressed={isActive}
							aria-label={label}
							data-active={isActive || undefined}
							onClick={() => onModeChange(item.id)}
						>
							<HugeiconsIcon
								icon={item.icon}
								size="var(--icon-md)"
								strokeWidth={isActive ? 1.5 : 1}
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
