import {
	CodeIcon,
	EyeIcon,
	PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { EditorViewMode } from "../../lib/editorMode";

const LARGE_NOTE_MODE_HINT = "Too large for Rich or Preview";

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
	plainOnly?: boolean;
}

export function EditorViewModeSwitch({
	mode,
	onModeChange,
	plainOnly = false,
}: EditorViewModeSwitchProps) {
	return (
		<div
			className="markdownEditorModeSwitch"
			role="tablist"
			aria-label="Editor mode"
		>
			{VIEW_MODES.map((item) => {
				const disabled = plainOnly && item.id !== "plain";
				const hint = disabled ? LARGE_NOTE_MODE_HINT : item.label;

				return (
					<span
						key={item.id}
						className="markdownEditorModeBtnWrap"
						data-disabled={disabled || undefined}
					>
						<button
							type="button"
							role="tab"
							className="markdownEditorModeBtn"
							aria-selected={mode === item.id}
							aria-pressed={mode === item.id}
							aria-label={item.label}
							data-active={mode === item.id || undefined}
							disabled={disabled}
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
							data-warning={disabled || undefined}
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
