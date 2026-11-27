import type { IconSvgElement } from "@hugeicons/react";
import { type KeyboardEvent, type ReactNode, useId, useState } from "react";
import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { DropdownMenuItemCheck } from "@/components/ui/shadcn/dropdown-menu";
import { isImeComposing } from "@/lib/imeComposition";

export interface TaskSearchItem {
	id: string;
	label: string;
	detail?: string;
	icon?: ReactNode;
	selected?: boolean;
}

interface TaskSearchListProps {
	label: string;
	placeholder: string;
	emptyLabel: string;
	query: string;
	onQueryChange: (query: string) => void;
	items: readonly TaskSearchItem[];
	onSelect: (id: string) => void;
	create?: { label: string; onCreate: () => void } | null;
}

export function searchItemIcon(icon: IconSvgElement) {
	return (
		<HugeiconsIcon
			icon={icon}
			size="var(--icon-sm)"
			className="glyphMenuItemIcon"
			aria-hidden="true"
		/>
	);
}

function focusOnMount(node: HTMLInputElement | null) {
	node?.focus({ preventScroll: true });
}

export function TaskSearchList({
	label,
	placeholder,
	emptyLabel,
	query,
	onQueryChange,
	items,
	onSelect,
	create = null,
}: TaskSearchListProps) {
	const idPrefix = useId();
	const [active, setActive] = useState(0);
	const total = items.length + (create ? 1 : 0);
	const activeIndex = total === 0 ? -1 : Math.min(active, total - 1);
	const optionId = (index: number) => `${idPrefix}-option-${index}`;

	const choose = (index: number) => {
		const item = items[index];
		if (item) onSelect(item.id);
		else if (create && index === items.length) create.onCreate();
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (isImeComposing(event)) return;
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			if (total === 0) return;
			const step = event.key === "ArrowDown" ? 1 : -1;
			setActive((activeIndex + step + total) % total);
			return;
		}
		if (event.key === "Enter" && activeIndex >= 0) {
			event.preventDefault();
			choose(activeIndex);
		}
	};

	return (
		<div className="tasksSearchList">
			<input
				ref={focusOnMount}
				className="tasksSearchListInput"
				type="text"
				role="combobox"
				aria-label={label}
				aria-expanded
				aria-controls={`${idPrefix}-listbox`}
				aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
				placeholder={placeholder}
				value={query}
				spellCheck={false}
				autoComplete="off"
				onChange={(event) => {
					onQueryChange(event.target.value);
					setActive(0);
				}}
				onKeyDown={handleKeyDown}
			/>
			<div className="glyphMenuSeparator" />
			<div
				id={`${idPrefix}-listbox`}
				className="tasksSearchListOptions"
				role="listbox"
				aria-label={label}
			>
				{items.map((item, index) => (
					<button
						key={item.id}
						id={optionId(index)}
						type="button"
						role="option"
						tabIndex={-1}
						aria-selected={item.selected ?? false}
						className="glyphMenuItem"
						data-highlighted={index === activeIndex ? "" : undefined}
						onMouseMove={() => setActive(index)}
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => choose(index)}
					>
						{item.icon}
						<span className="glyphMenuItemLabel">{item.label}</span>
						{item.detail ? <span className="glyphMenuItemTrailing">{item.detail}</span> : null}
						{item.selected ? <DropdownMenuItemCheck /> : null}
					</button>
				))}
				{create ? (
					<button
						id={optionId(items.length)}
						type="button"
						role="option"
						tabIndex={-1}
						aria-selected={false}
						className="glyphMenuItem"
						data-highlighted={activeIndex === items.length ? "" : undefined}
						onMouseMove={() => setActive(items.length)}
						onMouseDown={(event) => event.preventDefault()}
						onClick={create.onCreate}
					>
						<span className="glyphMenuItemLabel">{create.label}</span>
					</button>
				) : null}
				{total === 0 ? <p className="tasksSearchListEmpty">{emptyLabel}</p> : null}
			</div>
		</div>
	);
}
