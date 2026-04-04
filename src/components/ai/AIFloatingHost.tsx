import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { Suspense, lazy, useEffect } from "react";
import { useAISidebarContext } from "../../contexts";

const importAIPanel = () => import("./AIPanel");

const loadAIPanel = () =>
	importAIPanel().then((module) => ({
		default: module.AIPanel,
	}));

const LazyAIPanel = lazy(loadAIPanel);

interface AIFloatingHostProps {
	isOpen: boolean;
	onToggle: () => void;
}

export function AIFloatingHost({ isOpen, onToggle }: AIFloatingHostProps) {
	const { aiPanelWidth } = useAISidebarContext();
	const panelWidth = aiPanelWidth || 380;
	const shouldReduceMotion = useReducedMotion();

	useEffect(() => {
		if (!isOpen) return;
		void importAIPanel().then((module) => {
			void module.prefetchAIPanelData();
		});
	}, [isOpen]);

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
							<Suspense fallback={<div className="aiSidebarPanelInner" />}>
								<LazyAIPanel
									isOpen={isOpen}
									onClose={onToggle}
									width={panelWidth}
								/>
							</Suspense>
						</m.div>
					)}
				</AnimatePresence>
			</m.div>
		</>
	);
}
