/**
 * Motion-enhanced button components
 */

import { type HTMLMotionProps, motion } from "motion/react";
import { forwardRef } from "react";
import { cn } from "../../utils/cn";
import { springPresets } from "./animations";

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
				className={cn(baseClass, variantClass, className)}
				whileHover={{ scale: 1.05, y: -1 }}
				whileTap={{ scale: 0.95 }}
				transition={springPresets.bouncy}
				{...props}
			/>
		);
	},
);

MotionButton.displayName = "MotionButton";

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
				className={cn(sizeClass, activeClass, className)}
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
