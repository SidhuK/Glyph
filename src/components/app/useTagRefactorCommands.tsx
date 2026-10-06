import {
	Delete02Icon,
	GitMergeIcon,
	PencilEdit02Icon,
	Tag01Icon,
} from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import { useFileTreeContext, useSpace } from "../../contexts";
import {
	TAG_REFACTOR_ACTIONS,
	type TagRefactorAction,
	useTagRefactor,
} from "../../hooks/useTagRefactor";
import { HugeiconsIcon } from "../HugeiconsIcon";
import type { Command } from "./commandPaletteHelpers";

const ACTION_ICONS = {
	rename: PencilEdit02Icon,
	merge: GitMergeIcon,
	delete: Delete02Icon,
} satisfies Record<TagRefactorAction, unknown>;

/** Palette entries for tag refactors; `picker` replaces the palette list while choosing a tag. */
export function useTagRefactorCommands(
	pickerAction: TagRefactorAction | null,
	setPickerAction: (action: TagRefactorAction | null) => void,
	openPalette: (tab: "commands") => void,
): { commands: Command[]; picker: Command[] | null } {
	const { t } = useTranslation("shell");
	const { spacePath } = useSpace();
	const { tags } = useFileTreeContext();
	const { run, isPending } = useTagRefactor();
	const pickTag = (action: TagRefactorAction): Command[] =>
		tags.map((tag) => ({
			id: `tag-refactor-picker:${tag.tag}`,
			label: `#${tag.tag}`,
			icon: <HugeiconsIcon icon={Tag01Icon} size="var(--icon-lg)" />,
			category: t(`tags.refactor.${action}Picker`),
			action: () => run(action, tag.tag),
		}));
	const picker = pickerAction ? pickTag(pickerAction) : null;
	const commands = TAG_REFACTOR_ACTIONS.map((action) => ({
		id: `${action}-tag`,
		icon: <HugeiconsIcon icon={ACTION_ICONS[action]} size="var(--icon-lg)" />,
		enabled: Boolean(spacePath) && tags.length > 0 && !isPending,
		action: () => {
			setPickerAction(action);
			openPalette("commands");
		},
	}));
	return { commands, picker };
}
