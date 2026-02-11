export const BULK_LOAD_THRESHOLD = 8;

export const STICKY_COLORS = [
	{ bg: "#fff176", border: "#fbc02d" }, // Yellow
	{ bg: "#f48fb1", border: "#e91e63" }, // Pink
	{ bg: "#81d4fa", border: "#03a9f4" }, // Blue
	{ bg: "#a5d6a7", border: "#4caf50" }, // Green
	{ bg: "#ffcc80", border: "#ff9800" }, // Orange
	{ bg: "#ce93d8", border: "#9c27b0" }, // Purple
	{ bg: "#80cbc4", border: "#009688" }, // Teal
	{ bg: "#ef9a9a", border: "#f44336" }, // Red
] as const;

export const NODE_BASE_DIMENSIONS = {
	"rfNodeNote--xs": { width: "100px", minHeight: "80px" },
	"rfNodeNote--small": { width: "140px", minHeight: "100px" },
	"rfNodeNote--medium": { width: "208px", minHeight: "260px" },
	"rfNodeNote--large": { width: "280px", minHeight: "200px" },
	"rfNodeNote--xl": { width: "360px", minHeight: "260px" },
	"rfNodeNote--editor": { width: "520px", minHeight: "320px" },
	"rfNodeNote--tall": { width: "160px", minHeight: "240px" },
	"rfNodeNote--wide": { width: "320px", minHeight: "160px" },
	"rfNodeNote--square": { width: "180px", minHeight: "180px" },
} as const;
