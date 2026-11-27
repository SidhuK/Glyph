import type { ReactNode } from "react";
import { DropdownMenuItemCheck } from "@/components/ui/shadcn/dropdown-menu";

interface TaskCheckItem {
	id: string;
	label: string;
	icon: ReactNode;
	selected: boolean;
}

interface TaskCheckListProps {
	label: string;
	items: readonly TaskCheckItem[];
	onToggle: (id: string) => void;
}

export function TaskCheckList({ label, items, onToggle }: TaskCheckListProps) {
	return (
		<div className="tasksCheckList" role="listbox" aria-label={label} aria-multiselectable>
			{items.map((item) => (
				<button
					key={item.id}
					type="button"
					role="option"
					aria-selected={item.selected}
					className="glyphMenuItem"
					onClick={() => onToggle(item.id)}
				>
					<span className="glyphMenuItemIcon">{item.icon}</span>
					<span className="glyphMenuItemLabel">{item.label}</span>
					{item.selected ? <DropdownMenuItemCheck /> : null}
				</button>
			))}
		</div>
	);
}
