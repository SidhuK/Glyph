import { cn } from "@/lib/utils";
import { forwardRef } from "react";

type DivProps = React.HTMLAttributes<HTMLDivElement>;
type ListProps = React.HTMLAttributes<HTMLUListElement>;
type ListItemProps = React.HTMLAttributes<HTMLLIElement>;

export const Command = forwardRef<HTMLDivElement, DivProps>(
	({ className, ...props }, ref) => (
		<div ref={ref} className={className} {...props} />
	),
);

Command.displayName = "Command";

interface CommandInputProps
	extends React.InputHTMLAttributes<HTMLInputElement> {}

export const CommandInput = forwardRef<HTMLInputElement, CommandInputProps>(
	({ className, ...props }, ref) => (
		<input
			ref={ref}
			className={cn("commandPaletteInput", className)}
			{...props}
		/>
	),
);

CommandInput.displayName = "CommandInput";

export const CommandList = forwardRef<HTMLUListElement, ListProps>(
	({ className, ...props }, ref) => (
		<ul ref={ref} className={cn("commandPaletteList", className)} {...props} />
	),
);

CommandList.displayName = "CommandList";

export const CommandEmpty = forwardRef<HTMLLIElement, ListItemProps>(
	({ className, ...props }, ref) => (
		<li ref={ref} className={cn("commandPaletteEmpty", className)} {...props} />
	),
);

CommandEmpty.displayName = "CommandEmpty";

interface CommandItemProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	selected?: boolean;
}

export const CommandItem = forwardRef<HTMLButtonElement, CommandItemProps>(
	({ className, selected = false, ...props }, ref) => (
		<button
			ref={ref}
			type="button"
			className={cn(
				"commandPaletteItem",
				selected ? "selected" : "",
				className,
			)}
			{...props}
		/>
	),
);

CommandItem.displayName = "CommandItem";
