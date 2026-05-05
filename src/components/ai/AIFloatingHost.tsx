import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { Suspense, lazy, useEffect } from "react";

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
	const shouldReduceMotion = useReducedMotion();

	useEffect(() => {
		if (!isOpen) return;
		let cancelled = false;
		void importAIPanel()
			.then((module) => {
				if (cancelled) return;
				void module.prefetchAIPanelData();
			})
			.catch((error) => {
				console.error("Failed to preload AI panel data", error);
			});
		return () => {
			cancelled = true;
		};
	}, [isOpen]);

	return (
		<div className="aiFloatingWindowHost" data-window-drag-ignore>
			<AnimatePresence>
				{isOpen && (
					<m.div
						key="ai-floating-window"
						className="aiFloatingWindow"
						initial={
							shouldReduceMotion ? false : { opacity: 0, x: 8, scale: 0.99 }
						}
						animate={{ opacity: 1, x: 0, scale: 1 }}
						exit={shouldReduceMotion ? {} : { opacity: 0, x: 8, scale: 0.99 }}
						transition={
							shouldReduceMotion
								? { duration: 0 }
								: { type: "spring", stiffness: 360, damping: 28 }
						}
					>
						<Suspense fallback={<div className="aiFloatingWindowInner" />}>
							<div className="aiFloatingWindowInner">
								<LazyAIPanel isOpen={isOpen} onClose={onToggle} />
							</div>
						</Suspense>
					</m.div>
				)}
			</AnimatePresence>
		</div>
	);
}
