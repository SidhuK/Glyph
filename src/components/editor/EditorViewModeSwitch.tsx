import {
	CodeIcon,
	EyeIcon,
	PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { EditorViewMode } from "../../lib/editorMode";

const LARGE_NOTE_MODE_HINT = "May be slow on large notes";

const VIEW_MODES = [
	{ id: "plain" as const, label: "Raw", icon: CodeIcon },
	{ id: "rich" as const, label: "Rich", icon: PencilEdit02Icon },
	{
		id: "preview" as const,
		label: "Preview",
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
	return (
		<div
			className="markdownEditorModeSwitch"
			role="toolbar"
			aria-label="Editor mode"
		>
			{VIEW_MODES.map((item) => {
				const showLargeNoteHint = largeNote && item.id !== "plain";
				const hint = showLargeNoteHint ? LARGE_NOTE_MODE_HINT : item.label;

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
