/**
 * Motion-enhanced panel and container components
 */

import { AnimatePresence, m } from "motion/react";
import type { ReactNode } from "react";
import { directionVariants, springPresets } from "./animations";

interface MotionListItemProps {
	children: ReactNode;
	index?: number;
	isActive?: boolean;
	onClick?: () => void;
	className?: string;
}

export function MotionListItem({
	children,
	index = 0,
	isActive = false,
	onClick,
	className = "",
}: MotionListItemProps) {
	return (
		<m.li
			className={className}
			initial={{ x: -10 }}
			animate={{ x: 0 }}
			exit={{ x: -10 }}
			transition={{
				...springPresets.gentle,
				delay: index * 0.03,
			}}
			whileHover={{
				x: 4,
				backgroundColor: isActive ? undefined : "var(--bg-hover)",
			}}
			onClick={onClick}
		>
			{children}
		</m.li>
	);
}

interface MotionPanelProps {
	children: ReactNode;
	className?: string;
	direction?: "left" | "right" | "up" | "down";
}

export function MotionPanel({
	children,
	className = "",
	direction = "left",
}: MotionPanelProps) {
	return (
		<m.div
			className={className}
			{...directionVariants[direction]}
			transition={springPresets.gentle}
		>
			{children}
		</m.div>
	);
}

interface MotionFloatingPanelProps {
	isOpen: boolean;
	children: ReactNode;
	className?: string;
	onClose?: () => void;
}

export function MotionFloatingPanel({
	isOpen,
	children,
	className = "",
}: MotionFloatingPanelProps) {
	return (
		<AnimatePresence>
			{isOpen && (
				<m.div
					className={className}
					initial={{ scale: 0.95, y: 10 }}
					animate={{ scale: 1, y: 0 }}
					exit={{ scale: 0.95, y: 10 }}
					transition={springPresets.bouncy}
				>
					{children}
				</m.div>
			)}
		</AnimatePresence>
	);
}

interface MotionSidebarProps {
	children: ReactNode;
	className?: string;
	isCollapsed?: boolean;
}

export function MotionSidebar({
	children,
	className = "",
	isCollapsed = false,
}: MotionSidebarProps) {
	return (
		<m.aside
			className={className}
			initial={{ x: -20 }}
			animate={{
				x: 0,
				width: isCollapsed ? 0 : undefined,
			}}
			transition={springPresets.gentle}
		>
			{children}
		</m.aside>
	);
}

interface MotionEditorPanelProps {
	isOpen: boolean;
	children: ReactNode;
	className?: string;
}

export function MotionEditorPanel({
	isOpen,
	children,
	className = "",
}: MotionEditorPanelProps) {
	return (
		<AnimatePresence>
			{isOpen && (
				<m.aside
					className={className}
					initial={{ x: 30 }}
					animate={{ x: 0 }}
					exit={{ x: 30 }}
					transition={springPresets.gentle}
				>
					{children}
				</m.aside>
			)}
		</AnimatePresence>
	);
}

interface MotionCardProps {
	children: ReactNode;
	className?: string;
	isSelected?: boolean;
	onClick?: () => void;
}

export function MotionCard({
	children,
	className = "",
	isSelected = false,
	onClick,
}: MotionCardProps) {
	return (
		<m.div
			className={className}
			layout
			whileHover={{ y: -4, boxShadow: "var(--shadow-lg)" }}
			animate={{
				scale: isSelected ? 1.02 : 1,
				borderColor: isSelected ? "var(--interactive-accent)" : undefined,
			}}
			transition={springPresets.gentle}
			onClick={onClick}
		>
			{children}
		</m.div>
	);
}
