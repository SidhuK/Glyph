import { LicenseStatusFooter } from "../licensing/LicenseStatusFooter";
import { SpaceSwitcherFooter } from "./SpaceSwitcherFooter";

interface SidebarFooterProps {
	onSwitchSpace: (path: string) => void;
	onSwitchNextSpace?: () => void;
	onSwitchPreviousSpace?: () => void;
	reducedMotion?: boolean | null;
}

export function SidebarFooter({
	onSwitchSpace,
	onSwitchNextSpace,
	onSwitchPreviousSpace,
	reducedMotion,
}: SidebarFooterProps) {
	return (
		<div className="sidebarFooter">
			<SpaceSwitcherFooter
				onSwitch={onSwitchSpace}
				onSwitchNext={onSwitchNextSpace}
				onSwitchPrevious={onSwitchPreviousSpace}
				reducedMotion={reducedMotion}
			/>
			<LicenseStatusFooter />
		</div>
	);
}
