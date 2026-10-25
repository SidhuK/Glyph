import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuItemIcon,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import {
	ArrowDown01Icon,
	Calendar01Icon,
	Calendar02Icon,
	Calendar03Icon,
	Calendar04Icon,
	Layout01Icon as TemplatesIcon,
	PaintBoardIcon as CanvasIcon,
	StickyNote03Icon as QuickNoteIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useUILayoutContext } from "../../contexts";
import { type PeriodKind, isPeriodNoteEnabled } from "../../lib/periodNotes";
import { formatShortcutForPlatform } from "../../lib/shortcuts/platform";
import type { Shortcut } from "../../lib/shortcuts/types";

const PERIOD_ITEMS = [
	{
		kind: "day",
		labelKey: "sidebar.dailyNote",
		shortcutId: "open-daily-note",
		icon: Calendar03Icon,
	},
	{
		kind: "week",
		labelKey: "sidebar.weeklyNote",
		shortcutId: "open-weekly-note",
		icon: Calendar02Icon,
	},
	{
		kind: "month",
		labelKey: "sidebar.monthlyNote",
		shortcutId: "open-monthly-note",
		icon: Calendar01Icon,
	},
	{
		kind: "quarter",
		labelKey: "sidebar.quarterlyNote",
		shortcutId: "open-quarterly-note",
		icon: Calendar04Icon,
	},
] as const;

// React bubbles portal key events through the tree; keep menu navigation away
// from surrounding sidebar handlers while letting Escape and shortcuts through.
function stopMenuKeyPropagation(event: KeyboardEvent) {
	if (event.key === "Escape" || event.metaKey || event.ctrlKey) return;
	event.stopPropagation();
}

function CreateMenuItem({
	icon,
	label,
	shortcut,
	onClick,
}: {
	icon: IconSvgElement;
	label: string;
	shortcut: string;
	onClick: () => void;
}) {
	return (
		<DropdownMenuItem onClick={onClick}>
			<DropdownMenuItemIcon icon={icon} />
			<span className="glyphMenuItemLabel">{label}</span>
			{shortcut ? <span className="glyphMenuItemTrailing">{shortcut}</span> : null}
		</DropdownMenuItem>
	);
}

/** Chevron half of the sidebar New Note split button. */
export function SidebarCreateMenu({
	showCanvas,
	onNewCanvas,
	onOpenPeriodNote,
	onOpenQuickNote,
	onCreateFromTemplate,
	getBinding,
}: {
	showCanvas: boolean;
	onNewCanvas: () => void;
	onOpenPeriodNote: (kind: PeriodKind) => void;
	onOpenQuickNote: () => void;
	onCreateFromTemplate: () => void;
	getBinding: (id: string) => Shortcut | null;
}) {
	const { t } = useTranslation("shell");
	const { periodNotesEnabled } = useUILayoutContext();
	const shortcutLabel = (id: string) => {
		const binding = getBinding(id);
		return binding ? formatShortcutForPlatform(binding) : "";
	};
	const periodItems = PERIOD_ITEMS.filter(
		(item) => item.kind === "day" || isPeriodNoteEnabled(item.kind, periodNotesEnabled),
	);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<button
						type="button"
						className="sidebarCreateMenuTrigger"
						title={t("sidebar.moreCreateOptions")}
						aria-label={t("sidebar.moreCreateOptions")}
						onKeyDown={stopMenuKeyPropagation}
					/>
				}
			>
				<HugeiconsIcon icon={ArrowDown01Icon} size="var(--icon-sm)" aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" side="bottom" onKeyDown={stopMenuKeyPropagation}>
				<DropdownMenuLabel>{t("sidebar.createSection")}</DropdownMenuLabel>
				{showCanvas ? (
					<CreateMenuItem
						icon={CanvasIcon}
						label={t("sidebar.newCanvas")}
						shortcut={shortcutLabel("new-canvas")}
						onClick={onNewCanvas}
					/>
				) : null}
				<CreateMenuItem
					icon={TemplatesIcon}
					label={t("sidebar.fromTemplate")}
					shortcut={shortcutLabel("create-from-template")}
					onClick={onCreateFromTemplate}
				/>
				<CreateMenuItem
					icon={QuickNoteIcon}
					label={t("sidebar.quickNote")}
					shortcut={shortcutLabel("open-quick-note")}
					onClick={onOpenQuickNote}
				/>
				<DropdownMenuSeparator />
				<DropdownMenuLabel>{t("sidebar.periodicNotesSection")}</DropdownMenuLabel>
				{periodItems.map((item) => (
					<CreateMenuItem
						key={item.kind}
						icon={item.icon}
						label={t(item.labelKey)}
						shortcut={shortcutLabel(item.shortcutId)}
						onClick={() => onOpenPeriodNote(item.kind)}
					/>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
