import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	CodeIcon,
	EyeIcon,
	PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { useState } from "react";
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
	const [isPinnedOpen, setIsPinnedOpen] = useState(false);
	const [largeNoteDismissal, setLargeNoteDismissal] = useState({
		largeNote,
		mode,
		dismissed: false,
	});
	if (
		largeNoteDismissal.largeNote !== largeNote ||
		largeNoteDismissal.mode !== mode
	) {
		setLargeNoteDismissal({ largeNote, mode, dismissed: false });
	}
	const activeMode = VIEW_MODES.find((item) => item.id === mode);

	if (!activeMode) return null;

	const activeLabel = t(activeMode.labelKey);
	const shouldOpenForLargeNote = largeNote && mode !== "plain";
	const shouldShowBubble =
		isPinnedOpen || (shouldOpenForLargeNote && !largeNoteDismissal.dismissed);
	const closeBubble = () => {
		setIsPinnedOpen(false);
		if (shouldOpenForLargeNote) {
			setLargeNoteDismissal((current) => ({ ...current, dismissed: true }));
		}
	};

	return (
		<div
			className="markdownEditorModeSwitch"
			role="toolbar"
			aria-label={t("mode.label")}
			data-open={shouldShowBubble || undefined}
			onBlur={(event) => {
				const nextFocus = event.relatedTarget;
				if (
					nextFocus instanceof Node &&
					event.currentTarget.contains(nextFocus)
				) {
					return;
				}
				closeBubble();
			}}
			onFocus={() => setIsPinnedOpen(true)}
			onMouseLeave={closeBubble}
		>
			<button
				type="button"
				className="markdownEditorModeBtn markdownEditorModeCurrentBtn"
				aria-label={activeLabel}
				aria-expanded={shouldShowBubble}
				onClick={() => setIsPinnedOpen(true)}
			>
				<HugeiconsIcon icon={activeMode.icon} size="var(--icon-md)" />
			</button>
			<div className="markdownEditorModeBubble">
				{VIEW_MODES.map((item) => {
					const label = t(item.labelKey);
					const isActive = mode === item.id;

					return (
						<button
							key={item.id}
							type="button"
							className="markdownEditorModeBtn"
							aria-pressed={isActive}
							aria-label={label}
							data-active={isActive || undefined}
							onClick={() => onModeChange(item.id)}
						>
							<HugeiconsIcon icon={item.icon} size="var(--icon-md)" />
						</button>
					);
				})}
			</div>
		</div>
	);
}
