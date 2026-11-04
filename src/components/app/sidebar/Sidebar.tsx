import { useUILayoutContext } from "@/contexts";
import { LicenseStatusFooter } from "@/components/licensing/LicenseStatusFooter";
import { memo, useMemo } from "react";
import { SidebarContent } from "./SidebarContent";
import { SidebarHeader } from "./SidebarHeader";
import type { SidebarContentProps } from "./sidebarContentProps";
import { SidebarRailContext } from "./sidebarRailContext";

interface SidebarProps extends SidebarContentProps {
	/** Collapsed renders the icon rail; the content stays mounted either way. */
	sidebarCollapsed: boolean;
	/** Narrow windows hold the sidebar in the rail, so the toggle can't expand it. */
	toggleLocked: boolean;
	onToggleSidebar: () => void;
}

export const Sidebar = memo(function Sidebar({
	sidebarCollapsed,
	toggleLocked,
	onToggleSidebar,
	...contentProps
}: SidebarProps) {
	const { sidebarWidth } = useUILayoutContext();
	const railState = useMemo(() => ({ rail: sidebarCollapsed }), [sidebarCollapsed]);
	const spaceKey = contentProps.spacePath ?? "no-space";

	return (
		<SidebarRailContext.Provider value={railState}>
			<aside
				data-slot="sidebar"
				data-sidebar="sidebar"
				data-state={sidebarCollapsed ? "rail" : "expanded"}
				className="sidebar"
				style={{ width: sidebarCollapsed ? "var(--sidebar-rail-width)" : sidebarWidth }}
			>
				<div data-slot="sidebar-inner" className="sidebarContentRoot">
					<SidebarHeader toggleLocked={toggleLocked} onToggleSidebar={onToggleSidebar} />
					<SidebarContent key={spaceKey} {...contentProps} />
					<LicenseStatusFooter />
				</div>
			</aside>
		</SidebarRailContext.Provider>
	);
});
