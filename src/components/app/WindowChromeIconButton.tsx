import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface WindowChromeIconButtonProps {
	ariaLabel: string;
	ariaPressed?: boolean;
	disabled?: boolean;
	onClick: () => void;
	title: string;
	children: ReactNode;
}

export function WindowChromeIconButton({
	ariaLabel,
	ariaPressed,
	disabled = false,
	onClick,
	title,
	children,
}: WindowChromeIconButtonProps) {
	const { t } = useTranslation("shell");

	return (
		<button
			data-sidebar="trigger"
			type="button"
			className="windowChromeSidebarToggle"
			aria-label={ariaLabel}
			aria-pressed={ariaPressed}
			disabled={disabled}
			data-window-drag-ignore
			onClick={onClick}
			title={title}
		>
			{children}
			{import.meta.env.DEV && (
				<span className="sidebarDevBadge">{t("sidebar.devBadge")}</span>
			)}
		</button>
	);
}
