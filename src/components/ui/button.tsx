import { forwardRef } from "react";
import { cn } from "../../utils/cn";

type ButtonVariant = "default" | "primary" | "ghost" | "icon";
type ButtonSize = "default" | "sm";

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ButtonVariant;
	size?: ButtonSize;
	active?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{
			className,
			variant = "default",
			size = "default",
			active = false,
			type = "button",
			...props
		},
		ref,
	) => {
		return (
			<button
				ref={ref}
				type={type}
				className={cn(
					variant === "icon" ? "iconBtn" : "",
					variant === "primary" ? "primary" : "",
					variant === "ghost" ? "ghost" : "",
					variant === "icon" && size === "sm" ? "sm" : "",
					active ? "active" : "",
					className,
				)}
				{...props}
			/>
		);
	},
);

Button.displayName = "Button";
