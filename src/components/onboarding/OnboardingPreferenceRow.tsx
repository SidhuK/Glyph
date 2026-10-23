import { m } from "motion/react";
import type { ReactNode } from "react";
import { revealVariants } from "./onboardingMotion";

interface OnboardingPreferenceRowProps {
	id: string;
	label: string;
	children: ReactNode;
}

/** The label carries `${id}-label` so non-labelable controls can use aria-labelledby. */
export function OnboardingPreferenceRow({ id, label, children }: OnboardingPreferenceRowProps) {
	return (
		<m.li className="obPrefRow" variants={revealVariants}>
			<label id={`${id}-label`} className="obPrefLabel" htmlFor={id}>
				{label}
			</label>
			<div className="obPrefControl">{children}</div>
		</m.li>
	);
}
