import { createContext } from "react";
import type { Transition, Variants } from "motion/react";

export const ONBOARDING_EASE = [0.2, 0, 0, 1] as const;

const PAGE_SECONDS = 0.18;
const PAGE_OFFSET_PX = 12;
const REVEAL_STAGGER_SECONDS = 0.04;
const REVEAL_OFFSET_PX = 6;

const pageTransition: Transition = { duration: PAGE_SECONDS, ease: ONBOARDING_EASE };

/** 1 when moving forward, -1 when moving back; read by the sliding content column. */
export const OnboardingDirectionContext = createContext<1 | -1>(1);

/** The page section only fades, so the footer bar it contains never slides. */
export const pageVariants: Variants = {
	enter: { opacity: 0 },
	center: { opacity: 1, transition: pageTransition },
	exit: { opacity: 0, transition: pageTransition },
};

export const contentVariants: Variants = {
	enter: (direction: number) => ({ x: direction * PAGE_OFFSET_PX }),
	center: { x: 0, transition: { ...pageTransition, staggerChildren: REVEAL_STAGGER_SECONDS } },
	exit: (direction: number) => ({ x: direction * -PAGE_OFFSET_PX, transition: pageTransition }),
};

export const revealVariants: Variants = {
	enter: { opacity: 0, y: REVEAL_OFFSET_PX },
	center: { opacity: 1, y: 0, transition: pageTransition },
};

export function focusOnMount(node: HTMLElement | null) {
	node?.focus({ preventScroll: true });
}
