import { AnimatePresence, motion } from "motion/react";
import { useUIContext } from "../../contexts";
import { AiLattice } from "../Icons";
import { AIPanel } from "./AIPanel";

interface AIFloatingHostProps {
	isOpen: boolean;
	onToggle: () => void;
	activeFolderPath: string | null;
	onAttachContextFiles: (paths: string[]) => Promise<void>;
	onCreateNoteFromLastAssistant: (markdown: string) => Promise<void>;
}

export function AIFloatingHost({
	isOpen,
	onToggle,
	activeFolderPath,
	onAttachContextFiles,
	onCreateNoteFromLastAssistant,
}: AIFloatingHostProps) {
	const { aiPanelWidth } = useUIContext();

	return (
		<div
			className="aiFloatingHost"
			style={{
				position: "absolute",
				inset: 0,
				zIndex: 20,
				pointerEvents: "none",
			}}
			data-window-drag-ignore
		>
			<AIPanel
				isOpen={isOpen}
				activeFolderPath={activeFolderPath}
				onClose={onToggle}
				onAttachContextFiles={onAttachContextFiles}
				onCreateNoteFromLastAssistant={onCreateNoteFromLastAssistant}
				width={aiPanelWidth}
			/>
			<AnimatePresence initial={false}>
				{!isOpen ? (
					<motion.button
						type="button"
						className="aiFab"
						onClick={onToggle}
						style={{ pointerEvents: "auto" }}
						initial={{ opacity: 0, scale: 0.82, x: 8 }}
						animate={{ opacity: 1, scale: 1, x: 0 }}
						exit={{ opacity: 0, scale: 0.82, x: 8 }}
						whileHover={{ scale: 1.08 }}
						whileTap={{ scale: 0.95 }}
						transition={{ type: "spring", stiffness: 320, damping: 24 }}
						aria-label="Open AI panel"
						title="Open AI panel"
					>
						<AiLattice size={34} />
					</motion.button>
				) : null}
			</AnimatePresence>
		</div>
	);
}
