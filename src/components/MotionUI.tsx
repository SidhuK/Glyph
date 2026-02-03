/**
 * Motion-enhanced UI components using Framer Motion
 * Provides animated versions of common UI elements with modern micro-interactions
 */

import { AnimatePresence, type HTMLMotionProps, motion } from "motion/react";
import { type ReactNode, forwardRef } from "react";

// Spring animation presets for natural, bouncy interactions
const springPresets = {
	gentle: { type: "spring", stiffness: 300, damping: 25 } as const,
	bouncy: { type: "spring", stiffness: 400, damping: 17 } as const,
	snappy: { type: "spring", stiffness: 500, damping: 30 } as const,
	slow: { type: "spring", stiffness: 200, damping: 20 } as const,
};

// ============================================================================
// ANIMATED BUTTON
// ============================================================================

type MotionButtonProps = HTMLMotionProps<"button"> & {
	variant?: "default" | "primary" | "ghost" | "icon";
	size?: "default" | "sm";
};

export const MotionButton = forwardRef<HTMLButtonElement, MotionButtonProps>(
	(
		{ className = "", variant = "default", size = "default", ...props },
		ref,
	) => {
		const baseClass =
			size === "sm" ? "iconBtn sm" : variant === "icon" ? "iconBtn" : "";
		const variantClass =
			variant === "primary" ? "primary" : variant === "ghost" ? "ghost" : "";

		return (
			<motion.button
				ref={ref}
				className={`${baseClass} ${variantClass} ${className}`.trim()}
				whileHover={{ scale: 1.05, y: -1 }}
				whileTap={{ scale: 0.95 }}
				transition={springPresets.bouncy}
				{...props}
			/>
		);
	},
);

MotionButton.displayName = "MotionButton";

// ============================================================================
// ANIMATED ICON BUTTON
// ============================================================================

type IconButtonProps = HTMLMotionProps<"button"> & {
	active?: boolean;
	size?: "default" | "sm";
};

export const MotionIconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
	({ className = "", active = false, size = "default", ...props }, ref) => {
		const sizeClass = size === "sm" ? "iconBtn sm" : "iconBtn";
		const activeClass = active ? "active" : "";

		return (
			<motion.button
				ref={ref}
				className={`${sizeClass} ${activeClass} ${className}`.trim()}
				whileHover={{
					scale: 1.1,
					rotate: active ? 0 : 5,
				}}
				whileTap={{ scale: 0.9 }}
				transition={springPresets.bouncy}
				{...props}
			/>
		);
	},
);

MotionIconButton.displayName = "MotionIconButton";

// ============================================================================
// ANIMATED LIST ITEM
// ============================================================================

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
		<motion.li
			className={className}
			initial={{ x: -10 }}
			animate={{ x: 0 }}
			exit={{ x: -10 }}
			transition={{
				...springPresets.gentle,
				delay: index * 0.03, // Stagger effect
			}}
			whileHover={{
				x: 4,
				backgroundColor: isActive ? undefined : "var(--bg-hover)",
			}}
			onClick={onClick}
		>
			{children}
		</motion.li>
	);
}

// ============================================================================
// ANIMATED PANEL (for sidebars, editor panels)
// ============================================================================

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
	const directionVariants = {
		left: {
			initial: { x: -20 },
			animate: { x: 0 },
			exit: { x: -20 },
		},
		right: {
			initial: { x: 20 },
			animate: { x: 0 },
			exit: { x: 20 },
		},
		up: {
			initial: { y: -20 },
			animate: { y: 0 },
			exit: { y: -20 },
		},
		down: {
			initial: { y: 20 },
			animate: { y: 0 },
			exit: { y: 20 },
		},
	};

	return (
		<motion.div
			className={className}
			{...directionVariants[direction]}
			transition={springPresets.gentle}
		>
			{children}
		</motion.div>
	);
}

// ============================================================================
// ANIMATED FLOATING PANEL (for AI panel, modals)
// ============================================================================

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
				<motion.div
					className={className}
					initial={{ scale: 0.95, y: 10 }}
					animate={{ scale: 1, y: 0 }}
					exit={{ scale: 0.95, y: 10 }}
					transition={springPresets.bouncy}
				>
					{children}
				</motion.div>
			)}
		</AnimatePresence>
	);
}

// ============================================================================
// ANIMATED SIDEBAR
// ============================================================================

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
		<motion.aside
			className={className}
			initial={{ x: -20 }}
			animate={{
				x: 0,
				width: isCollapsed ? 0 : undefined,
			}}
			transition={springPresets.gentle}
		>
			{children}
		</motion.aside>
	);
}

// ============================================================================
// ANIMATED EDITOR PANEL
// ============================================================================

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
				<motion.aside
					className={className}
					initial={{ x: 30 }}
					animate={{ x: 0 }}
					exit={{ x: 30 }}
					transition={springPresets.gentle}
				>
					{children}
				</motion.aside>
			)}
		</AnimatePresence>
	);
}

// ============================================================================
// ANIMATED SEARCH INPUT
// ============================================================================

type MotionInputProps = HTMLMotionProps<"input">;

export const MotionInput = forwardRef<HTMLInputElement, MotionInputProps>(
	({ className = "", ...props }, ref) => {
		return (
			<motion.input
				ref={ref}
				className={className}
				whileFocus={{
					scale: 1.02,
					boxShadow: "0 0 0 4px var(--selection-bg-muted)",
				}}
				transition={springPresets.snappy}
				{...props}
			/>
		);
	},
);

MotionInput.displayName = "MotionInput";

// ============================================================================
// ANIMATED CARD (for canvas nodes)
// ============================================================================

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
		<motion.div
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
		</motion.div>
	);
}

// ============================================================================
// ANIMATED TOOLTIP
// ============================================================================

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

// ============================================================================
// STAGGERED LIST CONTAINER
// ============================================================================

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

// ============================================================================
// FADE IN ON MOUNT
// ============================================================================

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

// ============================================================================
// SCALE ON HOVER WRAPPER
// ============================================================================

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

// Re-export AnimatePresence for convenience
export { AnimatePresence } from "motion/react";
