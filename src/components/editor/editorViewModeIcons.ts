import { CodeIcon, EyeIcon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import type { EditorViewMode } from "../../lib/editorMode";

export const EDITOR_VIEW_MODE_ICONS = {
	plain: CodeIcon,
	rich: PencilEdit02Icon,
	preview: EyeIcon,
} as const satisfies Record<EditorViewMode, unknown>;
