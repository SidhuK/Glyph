import { m } from "motion/react";
import { type KeyboardEvent, type ReactNode, useContext } from "react";
import {
	OnboardingDirectionContext,
	contentVariants,
	focusOnMount,
	revealVariants,
} from "./onboardingMotion";

const INTERACTIVE_SELECTOR =
	"button, a, input, select, textarea, [role='listbox'], [role='option']";

interface OnboardingPageProps {
	headingId: string;
	title: string;
	subtitle?: string;
	icon?: ReactNode;
	children?: ReactNode;
	/** Rendered inside the footer bar; pass `.obFooterLeading` and `.obFooterTrailing` groups. */
	footer: ReactNode;
	/** Return activates this unless focus is already on a control. */
	onPrimary?: () => void;
	onEscape?: () => void;
}

export function OnboardingPage({
	headingId,
	title,
	subtitle,
	icon,
	children,
	footer,
	onPrimary,
	onEscape,
}: OnboardingPageProps) {
	const direction = useContext(OnboardingDirectionContext);
	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		// Popups portal out of the page; their keys still bubble here through React.
		const target = event.target;
		if (!(target instanceof Element) || !event.currentTarget.contains(target)) return;
		if (event.key === "Escape" && onEscape) {
			event.preventDefault();
			onEscape();
			return;
		}
		if (event.key !== "Enter" || !onPrimary || event.metaKey || event.shiftKey) return;
		if (target.closest(INTERACTIVE_SELECTOR)) return;
		event.preventDefault();
		onPrimary();
	};

	return (
		<div
			className="obPageLayout"
			role="group"
			aria-labelledby={headingId}
			onKeyDown={handleKeyDown}
		>
			<div className="obContentArea">
				<m.div className="obContent" custom={direction} variants={contentVariants}>
					{icon ? (
						<m.div className="obIcon" variants={revealVariants} aria-hidden="true">
							{icon}
						</m.div>
					) : null}
					<m.h1
						id={headingId}
						ref={focusOnMount}
						tabIndex={-1}
						className="obTitle"
						variants={revealVariants}
					>
						{title}
					</m.h1>
					{subtitle ? (
						<m.p className="obSubtitle" variants={revealVariants}>
							{subtitle}
						</m.p>
					) : null}
					{children}
				</m.div>
			</div>
			<div className="obFooter">{footer}</div>
		</div>
	);
}
