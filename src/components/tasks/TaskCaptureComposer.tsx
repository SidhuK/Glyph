import { CheckListIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	type KeyboardEvent,
	type ReactNode,
	type RefObject,
	useCallback,
} from "react";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";

interface TaskCaptureComposerProps {
	className?: string;
	inputRef?: RefObject<HTMLInputElement | null>;
	value: string;
	placeholder?: string;
	pending: boolean;
	dateControls?: ReactNode;
	onValueChange: (value: string) => void;
	onSubmit: () => void;
	onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}

export function TaskCaptureComposer({
	className,
	inputRef,
	value,
	placeholder = "Add a task...",
	pending,
	dateControls,
	onValueChange,
	onSubmit,
	onKeyDown,
}: TaskCaptureComposerProps) {
	const submit = useCallback(() => {
		onSubmit();
	}, [onSubmit]);

	return (
		<div
			className={
				className ? `calendarTaskComposer ${className}` : "calendarTaskComposer"
			}
		>
			<div className="calendarTaskComposerMain">
				<Input
					ref={inputRef}
					value={value}
					onChange={(event) => onValueChange(event.target.value)}
					placeholder={placeholder}
					onKeyDown={(event) => {
						if (event.defaultPrevented) return;
						if (event.key === "Enter" && !event.shiftKey) {
							if (!pending && value.trim()) {
								event.preventDefault();
								submit();
							}
							return;
						}
						onKeyDown?.(event);
					}}
				/>
				<Button
					type="button"
					size="icon-xs"
					variant="ghost"
					className="sidebarTopIconButton calendarAccentIconButton"
					onClick={submit}
					disabled={pending || !value.trim()}
					aria-label="Add task"
				>
					<HugeiconsIcon
						icon={CheckListIcon}
						size="var(--icon-md)"
						strokeWidth={0.9}
					/>
				</Button>
			</div>
			{dateControls ? (
				<div className="calendarTaskComposerDates">{dateControls}</div>
			) : null}
		</div>
	);
}
