import { m } from "motion/react";

const DRAW_SECONDS = 1.6;
const DRAW_DELAY_SECONDS = 0.4;
// In viewBox units: about 3px at the rendered 280px width. A non-scaling stroke would
// break pathLength in WebKit and stop the draw early.
const STROKE_WIDTH = 2.2;

// One continuous stroke: baseline y=90, x-height y=60, ascender loops peak near y=11.
const HELLO_PATH = [
	"M 10 86 C 26 76, 48 50, 54 30 C 58 18, 54 10, 47 12 C 40 14, 37 30, 36 50",
	"C 35 66, 34 80, 34 90 C 38 72, 46 60, 56 60 C 66 60, 66 72, 64 82 C 63 88, 66 92, 72 90",
	"C 82 86, 96 76, 98 68 C 100 61, 94 58, 89 61 C 82 66, 82 82, 88 88 C 94 93, 104 90, 112 82",
	"C 118 76, 126 52, 128 30 C 130 17, 126 10, 121 12 C 115 15, 112 40, 112 64",
	"C 112 82, 116 90, 123 90 C 132 90, 144 54, 148 30 C 150 17, 146 10, 141 12",
	"C 135 15, 132 40, 132 64 C 132 82, 136 90, 143 90 C 150 90, 156 78, 160 70",
	"C 163 64, 168 60, 174 61 C 182 63, 185 74, 181 82 C 177 90, 166 92, 161 86",
	"C 156 80, 160 67, 168 62 C 174 59, 178 64, 182 66 C 188 68, 194 66, 200 62",
].join(" ");

interface OnboardingHelloPathProps {
	id: string;
	label: string;
	animated: boolean;
	onDrawn: () => void;
}

/** Handwritten "hello" drawn as a single stroke. */
export function OnboardingHelloPath({ id, label, animated, onDrawn }: OnboardingHelloPathProps) {
	return (
		<svg id={id} role="img" aria-label={label} className="obHelloPath" viewBox="4 4 202 94">
			<m.path
				d={HELLO_PATH}
				fill="none"
				stroke="currentColor"
				strokeWidth={STROKE_WIDTH}
				strokeLinecap="round"
				strokeLinejoin="round"
				// Opacity hides the round cap's dot until drawing starts.
				initial={animated ? { pathLength: 0, opacity: 0 } : false}
				animate={{ pathLength: 1, opacity: 1 }}
				transition={{
					pathLength: { duration: DRAW_SECONDS, delay: DRAW_DELAY_SECONDS, ease: "easeInOut" },
					opacity: { duration: 0.01, delay: DRAW_DELAY_SECONDS },
				}}
				onAnimationComplete={onDrawn}
			/>
		</svg>
	);
}
