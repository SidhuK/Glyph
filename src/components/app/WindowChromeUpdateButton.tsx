import { AnimatePresence, m } from "motion/react";

interface WindowChromeUpdateButtonProps {
	updateReady: boolean;
	updateVersion: string | null;
	onInstallUpdate: () => void;
}

export function WindowChromeUpdateButton({
	updateReady,
	updateVersion,
	onInstallUpdate,
}: WindowChromeUpdateButtonProps) {
	return (
		<AnimatePresence initial={false}>
			{updateReady ? (
				<m.button
					layout
					type="button"
					className="windowChromeUpdateButton"
					data-window-drag-ignore
					initial={{ opacity: 0, scale: 0.92, x: -6 }}
					animate={{ opacity: 1, scale: 1, x: 0 }}
					exit={{ opacity: 0, scale: 0.92, x: -6 }}
					transition={{ type: "spring", stiffness: 420, damping: 32 }}
					onClick={onInstallUpdate}
					title={
						updateVersion ? `Install update ${updateVersion}` : "Install update"
					}
				>
					<span>Update available</span>
				</m.button>
			) : null}
		</AnimatePresence>
	);
}
