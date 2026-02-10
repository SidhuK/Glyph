import { motion } from "motion/react";
import { AiLattice } from "../Icons";
import { AIPanel } from "./AIPanel";

interface AIFloatingHostProps {
	isOpen: boolean;
	onToggle: () => void;
	activeFolderPath: string | null;
	activeCanvasId: string | null;
	onNewAICanvas: () => Promise<void>;
	onAddAttachmentsToCanvas: (paths: string[]) => Promise<void>;
	onCreateNoteFromLastAssistant: (markdown: string) => Promise<void>;
}

export function AIFloatingHost({
	isOpen,
	onToggle,
	activeFolderPath,
	activeCanvasId,
	onNewAICanvas,
	onAddAttachmentsToCanvas,
	onCreateNoteFromLastAssistant,
}: AIFloatingHostProps) {
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
				activeCanvasId={activeCanvasId}
				onClose={onToggle}
				onNewAICanvas={onNewAICanvas}
				onAddAttachmentsToCanvas={onAddAttachmentsToCanvas}
				onCreateNoteFromLastAssistant={onCreateNoteFromLastAssistant}
			/>
			{!isOpen ? (
				<motion.button
					type="button"
					className="aiFab"
					onClick={onToggle}
					style={{ pointerEvents: "auto" }}
					initial={{ opacity: 0, scale: 0.8 }}
					animate={{ opacity: 1, scale: 1 }}
					exit={{ opacity: 0, scale: 0.8 }}
					whileHover={{ scale: 1.1 }}
					whileTap={{ scale: 0.95 }}
					transition={{ type: "spring", stiffness: 300, damping: 20 }}
					aria-label="Open AI panel"
					title="Open AI panel"
				>
					<AiLattice size={34} />
				</motion.button>
			) : null}
		</div>
	);
}
