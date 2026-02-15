import { cn } from "@/lib/utils";
import { forwardRef } from "react";

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
					variant === "icon"
						? "inline-flex size-9 items-center justify-center rounded-md"
						: "",
					variant === "primary" ? "primary" : "",
					variant === "ghost" ? "ghost" : "",
					variant === "icon" && size === "sm" ? "size-8" : "",
					active ? "active" : "",
					className,
				)}
				{...props}
			/>
		);
	},
);

Button.displayName = "Button";
