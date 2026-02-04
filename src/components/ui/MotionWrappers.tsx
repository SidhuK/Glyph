/**
 * Motion utility wrapper components
 */

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { springPresets } from "./animations";

interface MotionTooltipProps {
	isVisible: boolean;
	content: ReactNode;
	className?: string;
}

export function MotionTooltip({
	isVisible,
	content,
	className = "",
}: MotionTooltipProps) {
	return (
		<AnimatePresence>
			{isVisible && (
				<motion.div
					className={className}
					initial={{ opacity: 0, y: 5, scale: 0.95 }}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					exit={{ opacity: 0, y: 5, scale: 0.95 }}
					transition={{ duration: 0.15 }}
				>
					{content}
				</motion.div>
			)}
		</AnimatePresence>
	);
}

interface StaggeredListProps {
	children: ReactNode;
	className?: string;
	as?: "ul" | "ol" | "div";
}

export function StaggeredList({
	children,
	className = "",
	as: Component = "ul",
}: StaggeredListProps) {
	const MotionComponent = motion[Component];

	return (
		<MotionComponent
			className={className}
			initial="hidden"
			animate="visible"
			variants={{
				visible: {
					transition: {
						staggerChildren: 0.05,
					},
				},
			}}
		>
			{children}
		</MotionComponent>
	);
}

interface FadeInProps {
	children: ReactNode;
	className?: string;
	delay?: number;
}

export function FadeIn({ children, className = "", delay = 0 }: FadeInProps) {
	return (
		<motion.div
			className={className}
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.3, delay }}
		>
			{children}
		</motion.div>
	);
}

interface ScaleOnHoverProps {
	children: ReactNode;
	className?: string;
	scale?: number;
}

export function ScaleOnHover({
	children,
	className = "",
	scale = 1.05,
}: ScaleOnHoverProps) {
	return (
		<motion.div
			className={className}
			whileHover={{ scale }}
			whileTap={{ scale: 0.98 }}
			transition={springPresets.bouncy}
		>
			{children}
		</motion.div>
	);
}
