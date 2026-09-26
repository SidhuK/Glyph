import { cn } from "@/lib/utils";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { memo } from "react";
import { useUILayoutContext } from "../../contexts";
import type { SpaceDefinition } from "../../lib/spaceRegistry";
import { LicenseStatusFooter } from "../licensing/LicenseStatusFooter";
import { RecoveryButton } from "../recovery/RecoveryButton";
import { SidebarContent, type SidebarContentProps } from "./SidebarContent";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarSettingsContent } from "./SidebarSettingsContent";
import { SpaceSwitcher } from "./SpaceSwitcher";

interface SidebarProps extends SidebarContentProps {
	sidebarCollapsed: boolean;
	spaces: SpaceDefinition[];
	activeSpacePath: string | null;
	switchingSpacePath: string | null;
	onSelectSpace: (path: string) => Promise<boolean>;
	onSetSpaceIcon: (path: string, iconName: string | null) => Promise<void>;
	onCloseSpace: (path: string) => Promise<void>;
}

export const Sidebar = memo(function Sidebar({
	sidebarCollapsed,
	spaces,
	activeSpacePath,
	switchingSpacePath,
	onSelectSpace,
	onSetSpaceIcon,
	onCloseSpace,
	...contentProps
}: SidebarProps) {
	const { sidebarWidth, settingsMode } = useUILayoutContext();
	const shouldReduceMotion = useReducedMotion();
	const sidebarState = sidebarCollapsed ? "collapsed" : "expanded";
	const spaceSwitcher = (
		<SpaceSwitcher
			spaces={spaces}
			activeSpacePath={activeSpacePath}
			switchingSpacePath={switchingSpacePath}
			onSelectSpace={onSelectSpace}
			onSetSpaceIcon={onSetSpaceIcon}
			onCloseSpace={onCloseSpace}
		/>
	);

	return (
		<m.aside
			data-slot="sidebar"
			data-sidebar="sidebar"
			data-state={sidebarState}
			data-collapsible={sidebarCollapsed ? "offcanvas" : ""}
			className={cn("sidebar", sidebarCollapsed && "sidebarCollapsed")}
			style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
			layout
			transition={
				shouldReduceMotion
					? { type: "tween", duration: 0 }
					: { type: "spring", stiffness: 400, damping: 30 }
			}
		>
			<AnimatePresence>
				{!sidebarCollapsed && (
					<m.div
						key="sidebar-content"
						data-slot="sidebar-inner"
						className="sidebarContentRoot"
						initial={shouldReduceMotion ? false : { opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={shouldReduceMotion ? {} : { opacity: 0 }}
						transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.15 }}
					>
						{settingsMode ? (
							<>
								<div aria-hidden="true" className="sidebarDragLayer" data-tauri-drag-region />
								<div className="sidebarHeader" data-tauri-drag-region />
								<SidebarSettingsContent />
							</>
						) : (
							<>
								<SidebarHeader />
								<SidebarContent key={activeSpacePath ?? "no-space"} {...contentProps} />
								<div className="sidebarBottomLayer">
									{spaceSwitcher}
									<RecoveryButton key={activeSpacePath} />
									<LicenseStatusFooter />
								</div>
							</>
						)}
					</m.div>
				)}
			</AnimatePresence>
		</m.aside>
	);
});
