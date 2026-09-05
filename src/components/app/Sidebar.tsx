import { cn } from "@/lib/utils";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { memo } from "react";
import { useUILayoutContext } from "../../contexts";
import { LicenseStatusFooter } from "../licensing/LicenseStatusFooter";
import { SidebarContent, type SidebarContentProps } from "./SidebarContent";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarSettingsContent } from "./SidebarSettingsContent";

interface SidebarProps extends SidebarContentProps {
	sidebarCollapsed: boolean;
	onToggleSidebar: () => void;
}

export const Sidebar = memo(function Sidebar({
	sidebarCollapsed,
	onToggleSidebar,
	...contentProps
}: SidebarProps) {
	const { sidebarWidth, settingsMode } = useUILayoutContext();
	const shouldReduceMotion = useReducedMotion();
	const sidebarState = sidebarCollapsed ? "collapsed" : "expanded";

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
						transition={
							shouldReduceMotion ? { duration: 0 } : { duration: 0.15 }
						}
					>
						{settingsMode ? (
							<>
								<div
									aria-hidden="true"
									className="sidebarDragLayer"
									data-tauri-drag-region
								/>
								<div className="sidebarHeader" data-tauri-drag-region />
								<SidebarSettingsContent />
							</>
						) : (
							<>
								<SidebarHeader
									sidebarCollapsed={sidebarCollapsed}
									onToggleSidebar={onToggleSidebar}
								/>
								<SidebarContent {...contentProps} />
								<LicenseStatusFooter />
							</>
						)}
					</m.div>
				)}
			</AnimatePresence>
		</m.aside>
	);
});
