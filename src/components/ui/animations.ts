/**
 * Shared animation variants and spring presets for Motion components
 */

export const springPresets = {
	gentle: { type: "spring", stiffness: 300, damping: 25 } as const,
	bouncy: { type: "spring", stiffness: 400, damping: 17 } as const,
	snappy: { type: "spring", stiffness: 500, damping: 30 } as const,
	slow: { type: "spring", stiffness: 200, damping: 20 } as const,
};

export const directionVariants = {
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
