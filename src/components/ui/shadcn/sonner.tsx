"use client";

import {
	Alert02Icon,
	CheckCircle,
	InformationCircleIcon,
	LoaderCircle,
	OctagonIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
	const { theme = "system" } = useTheme();

	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			className="toaster group"
			icons={{
				success: (
					<HugeiconsIcon
						icon={CheckCircle}
						className="size-4"
						strokeWidth={0.9}
					/>
				),
				info: (
					<HugeiconsIcon
						icon={InformationCircleIcon}
						className="size-4"
						strokeWidth={0.9}
					/>
				),
				warning: (
					<HugeiconsIcon
						icon={Alert02Icon}
						className="size-4"
						strokeWidth={0.9}
					/>
				),
				error: (
					<HugeiconsIcon
						icon={OctagonIcon}
						className="size-4"
						strokeWidth={0.9}
					/>
				),
				loading: (
					<HugeiconsIcon
						icon={LoaderCircle}
						className="size-4 animate-spin"
						strokeWidth={0.9}
					/>
				),
			}}
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "var(--radius)",
				} as React.CSSProperties
			}
			{...props}
		/>
	);
};

export { Toaster };
