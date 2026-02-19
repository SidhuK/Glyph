import { AiBrain04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useAISidebarContext } from "../../contexts";
import { getShortcutTooltip } from "../../lib/shortcuts";
import { AIPanel } from "./AIPanel";

interface AIFloatingHostProps {
	isOpen: boolean;
	onToggle: () => void;
	activeFolderPath: string | null;
	onAttachContextFiles: (paths: string[]) => Promise<void>;
}

export function AIFloatingHost({
	isOpen,
	onToggle,
	activeFolderPath,
	onAttachContextFiles,
}: AIFloatingHostProps) {
	const { aiPanelWidth } = useAISidebarContext();
	const panelWidth = aiPanelWidth || 380;
	const shouldReduceMotion = useReducedMotion();

	return (
		<>
			<m.div
				className="aiSidebarPanel"
				style={{ width: isOpen ? panelWidth : 0 }}
				layout
				transition={
					shouldReduceMotion
						? { type: "tween", duration: 0 }
						: { type: "spring", stiffness: 400, damping: 30 }
				}
				data-window-drag-ignore
			>
				<AnimatePresence>
					{isOpen && (
						<m.div
							key="ai-panel-content"
							className="aiSidebarPanelInner"
							initial={shouldReduceMotion ? false : { opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={shouldReduceMotion ? {} : { opacity: 0 }}
							transition={
								shouldReduceMotion ? { duration: 0 } : { duration: 0.15 }
							}
						>
							<AIPanel
								isOpen={isOpen}
								activeFolderPath={activeFolderPath}
								onClose={onToggle}
								onAttachContextFiles={onAttachContextFiles}
								width={panelWidth}
							/>
						</m.div>
					)}
				</AnimatePresence>
			</m.div>
			{!isOpen && (
				<button
					type="button"
					className="aiFab"
					onClick={onToggle}
					aria-label="Open AI panel"
					title={`Open AI panel (${getShortcutTooltip({ meta: true, shift: true, key: "a" })})`}
				>
					<HugeiconsIcon icon={AiBrain04Icon} size={34} />
				</button>
			)}
		</>
	);
}
