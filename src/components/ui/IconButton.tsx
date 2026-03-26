import type { VariantProps } from "class-variance-authority";
import type * as React from "react";

import { Button, type buttonVariants } from "./shadcn/button";

type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
type ButtonSize = VariantProps<typeof buttonVariants>["size"];

interface IconButtonProps
	extends Omit<React.ComponentProps<typeof Button>, "size" | "children"> {
	label: string;
	size?: Extract<ButtonSize, "icon-xs" | "icon-sm" | "icon" | "icon-lg">;
	variant?: ButtonVariant;
	children: React.ReactNode;
}

function IconButton({
	label,
	size = "icon-sm",
	variant = "ghost",
	children,
	...props
}: IconButtonProps) {
	return (
		<Button
			type="button"
			variant={variant}
			size={size}
			aria-label={label}
			title={props.title ?? label}
			{...props}
		>
			{children}
		</Button>
	);
}

export { IconButton };
