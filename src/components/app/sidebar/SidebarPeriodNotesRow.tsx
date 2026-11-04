import { useUILayoutContext } from "@/contexts";
import type { PeriodKind } from "@/lib/periodNotes";
import type { SidebarVisibilityKey } from "@/lib/settings/model";
import { useTranslation } from "react-i18next";
import { SidebarActionButton } from "./SidebarActionButton";
import { enabledPeriodItems } from "./SidebarCreateMenu";

interface SidebarPeriodNotesRowProps {
	"data-sidebar-key": SidebarVisibilityKey;
	onOpenPeriodNote: (kind: PeriodKind) => void;
}

/** One nav row per enabled period note (daily always, the rest when turned on). */
export function SidebarPeriodNotesRow({
	"data-sidebar-key": sidebarKey,
	onOpenPeriodNote,
}: SidebarPeriodNotesRowProps) {
	const { t } = useTranslation("shell");
	const { periodNotesEnabled } = useUILayoutContext();

	return (
		<div className="sidebarNavRow" data-sidebar-key={sidebarKey} data-section="period-notes">
			{enabledPeriodItems(periodNotesEnabled).map((item) => (
				<SidebarActionButton
					key={item.kind}
					label={t(item.labelKey)}
					icon={item.icon}
					onClick={() => onOpenPeriodNote(item.kind)}
				/>
			))}
		</div>
	);
}
