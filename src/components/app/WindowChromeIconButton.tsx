import type { ReactNode } from "react";

interface WindowChromeIconButtonProps {
	ariaLabel: string;
	ariaPressed?: boolean;
	onClick: () => void;
	title: string;
	children: ReactNode;
}

export function WindowChromeIconButton({
	ariaLabel,
	ariaPressed,
	onClick,
	title,
	children,
}: WindowChromeIconButtonProps) {
	return (
		<button
			data-sidebar="trigger"
			type="button"
			className="windowChromeSidebarToggle"
			aria-label={ariaLabel}
			aria-pressed={ariaPressed}
			data-window-drag-ignore
			onClick={onClick}
			title={title}
		>
			{children}
		</button>
	);
}
