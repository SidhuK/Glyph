import { AnimatePresence, motion } from "motion/react";
import { useUIContext, useVault } from "../../contexts";
import { SidebarContent } from "./SidebarContent";
import { SidebarHeader } from "./SidebarHeader";

interface SidebarProps {
	onToggleDir: (dirPath: string) => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => void;
	onNewFile: () => void;
	onNewFileInDir: (dirPath: string) => void;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onRenameDir: (dirPath: string, nextName: string) => Promise<string | null>;
	onOpenSearchAsCanvas: (query: string) => void;
	onSelectSearchNote: (id: string) => void;
	onSelectTag: (tag: string) => void;
	onOpenCommandPalette: () => void;
}

export function Sidebar({
	onToggleDir,
	onSelectDir,
	onOpenFile,
	onNewFile,
	onNewFileInDir,
	onNewFolderInDir,
	onRenameDir,
	onOpenSearchAsCanvas,
	onSelectSearchNote,
	onSelectTag,
	onOpenCommandPalette,
}: SidebarProps) {
	// Contexts
	const { vaultPath, onOpenVault, onCreateVault } = useVault();
	const { sidebarCollapsed } = useUIContext();
	const { showSearch, setShowSearch } = useUIContext();

	return (
		<motion.aside
			className={`sidebar ${sidebarCollapsed ? "sidebarCollapsed" : ""}`}
			layout
			transition={{ type: "spring", stiffness: 400, damping: 30 }}
		>
			<AnimatePresence>
				{!sidebarCollapsed && (
					<motion.div
						key="sidebar-content"
						className="sidebarContentRoot"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
					>
						<SidebarHeader
							vaultPath={vaultPath}
							showSearch={showSearch}
							setShowSearch={setShowSearch}
							onOpenVault={onOpenVault}
							onCreateVault={onCreateVault}
							onOpenCommandPalette={onOpenCommandPalette}
						/>
						<SidebarContent
							onToggleDir={onToggleDir}
							onSelectDir={onSelectDir}
							onOpenFile={onOpenFile}
							onNewFile={onNewFile}
							onNewFileInDir={onNewFileInDir}
							onNewFolderInDir={onNewFolderInDir}
							onRenameDir={onRenameDir}
							onOpenSearchAsCanvas={onOpenSearchAsCanvas}
							onSelectSearchNote={onSelectSearchNote}
							onSelectTag={onSelectTag}
						/>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.aside>
	);
}
