import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { type KeyboardEvent, type ReactNode, useId, useState } from "react";

export interface TaskOption {
	id: string;
	label: string;
	icon: ReactNode;
	hint?: string;
	selected: boolean;
	keywords: readonly string[];
}

interface TaskOptionMenuProps {
	label: string;
	options: readonly TaskOption[];
	query: string;
	onSelect: (id: string) => void;
}

function optionMatching(
	options: readonly TaskOption[],
	matches: (text: string) => boolean,
): number {
	return options.findIndex((option) => [option.label, ...option.keywords].some(matches));
}

function initialIndex(options: readonly TaskOption[], query: string): number {
	const needle = query.trim().toLowerCase();
	const exact = needle ? optionMatching(options, (text) => text.toLowerCase() === needle) : -1;
	if (exact !== -1) return exact;
	const prefix = needle
		? optionMatching(options, (text) => text.toLowerCase().startsWith(needle))
		: -1;
	if (prefix !== -1) return prefix;
	return Math.max(
		0,
		options.findIndex((option) => option.selected),
	);
}

function nextOptionIndex(key: string, index: number, lastIndex: number): number | null {
	switch (key) {
		case "ArrowDown":
			return Math.min(lastIndex, index + 1);
		case "ArrowUp":
			return Math.max(0, index - 1);
		case "Home":
			return 0;
		case "End":
			return lastIndex;
		default:
			return null;
	}
}

export function TaskOptionMenu({ label, options, query, onSelect }: TaskOptionMenuProps) {
	const idPrefix = useId();
	const [activeIndex, setActiveIndex] = useState(() => initialIndex(options, query));
	const optionId = (index: number) => `${idPrefix}-option-${index}`;

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const nextIndex = nextOptionIndex(event.key, activeIndex, options.length - 1);
		if (nextIndex !== null) {
			event.preventDefault();
			setActiveIndex(nextIndex);
			return;
		}
		const active = options[activeIndex];
		if (event.key !== "Enter" || !active) return;
		event.preventDefault();
		onSelect(active.id);
	};

	return (
		<div
			className="taskOptionMenu"
			role="listbox"
			tabIndex={0}
			aria-label={label}
			aria-activedescendant={optionId(activeIndex)}
			onKeyDown={handleKeyDown}
		>
			{options.map((option, index) => (
				<div
					key={option.id}
					id={optionId(index)}
					role="option"
					aria-selected={option.selected}
					className="glyphMenuItem taskOptionMenuItem"
					data-highlighted={index === activeIndex ? "" : undefined}
					onMouseDown={(event) => event.preventDefault()}
					onPointerMove={() => {
						if (index !== activeIndex) setActiveIndex(index);
					}}
					onClick={() => onSelect(option.id)}
				>
					{option.icon}
					<span className="glyphMenuItemLabel">{option.label}</span>
					{option.hint ? <span className="taskOptionMenuHint">{option.hint}</span> : null}
					{option.selected ? (
						<HugeiconsIcon icon={Tick02Icon} size="var(--icon-sm)" className="glyphMenuItemCheck" />
					) : null}
				</div>
			))}
		</div>
	);
}
