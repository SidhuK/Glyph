import { useMemo, useState } from "react";
import { DATABASE_COLUMN_ICON_OPTIONS } from "../../lib/database/columnIcons";
import type { DatabaseColumn } from "../../lib/database/types";
import { Search } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";

interface DatabaseColumnIconPickerProps {
	column: DatabaseColumn;
	onSelectIcon: (icon: string | null) => void;
}

export function DatabaseColumnIconPicker({
	column,
	onSelectIcon,
}: DatabaseColumnIconPickerProps) {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const filteredOptions = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		if (!normalized) return DATABASE_COLUMN_ICON_OPTIONS;
		return DATABASE_COLUMN_ICON_OPTIONS.filter(
			(option) =>
				option.label.toLowerCase().includes(normalized) ||
				option.id.includes(normalized),
		);
	}, [query]);

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				if (!nextOpen) setQuery("");
			}}
		>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					className="databaseColumnIconButton"
					title={`Choose icon for ${column.label}`}
					aria-label={`Choose icon for ${column.label}`}
				>
					<DatabaseColumnIcon column={column} size={14} />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				sideOffset={8}
				className="databasePickerPopover databaseColumnIconPopover"
			>
				<div className="databasePickerHeader">
					<div className="databasePickerEyebrow">Column icon</div>
				</div>
				<div className="databasePickerSearch">
					<Search size={14} />
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search icons"
						aria-label="Search icons"
					/>
				</div>
				<div className="databaseColumnIconGrid">
					<button
						type="button"
						className="databaseColumnIconOption databaseColumnIconOptionDefault"
						data-active={!column.icon ? "true" : "false"}
						onClick={() => {
							onSelectIcon(null);
							setOpen(false);
						}}
					>
						<span className="databaseColumnIconOptionGlyph">
							<DatabaseColumnIcon
								column={{ ...column, icon: null }}
								size={16}
							/>
						</span>
						<span className="databaseColumnIconOptionLabel">Default</span>
					</button>
					{filteredOptions.map((option) => (
						<button
							key={option.id}
							type="button"
							className="databaseColumnIconOption"
							data-active={column.icon === option.id ? "true" : "false"}
							onClick={() => {
								onSelectIcon(option.id);
								setOpen(false);
							}}
							title={option.label}
							aria-label={option.label}
						>
							<span className="databaseColumnIconOptionGlyph">
								<DatabaseColumnIcon iconName={option.id} size={16} />
							</span>
							<span className="databaseColumnIconOptionLabel">
								{option.label}
							</span>
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
