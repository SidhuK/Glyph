import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface OnboardingFrameProps {
	children: ReactNode;
	className?: string;
	role?: "dialog";
	"aria-modal"?: boolean;
	"aria-labelledby"?: string;
}

/** Full-window surface for the no-space screen and the replay overlay. */
export function OnboardingFrame({ children, className, ...dialogProps }: OnboardingFrameProps) {
	return (
		<LazyMotion features={domMax}>
			<MotionConfig reducedMotion="user">
				<div className={cn("onboardingRoot", className)} {...dialogProps}>
					<div className="obDragStrip" data-tauri-drag-region aria-hidden="true" />
					{children}
				</div>
			</MotionConfig>
		</LazyMotion>
	);
}
