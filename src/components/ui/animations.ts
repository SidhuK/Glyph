/**
 * Shared animation variants and spring presets for Motion components
 */

export const springPresets = {
	gentle: { type: "spring", stiffness: 300, damping: 25 } as const,
	bouncy: { type: "spring", stiffness: 400, damping: 17 } as const,
	snappy: { type: "spring", stiffness: 500, damping: 30 } as const,
};
