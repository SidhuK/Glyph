import { useState } from "react";
import { Hash } from "../Icons";
import {
	formatTagLabel,
	normalizeTagToken,
} from "../editor/noteProperties/utils";
import { Button } from "../ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { DatabaseTagPickerPanel } from "./DatabaseTagPickerPanel";

interface DatabaseTagPickerProps {
	value: string;
	onChange: (value: string) => void;
	label: string;
	description: string;
	placeholder?: string;
	emptyLabel?: string;
}

function normalizedSelection(value: string): string | null {
	return normalizeTagToken(value);
}

export function DatabaseTagPicker({
	value,
	onChange,
	label,
	description,
	placeholder = "Choose a tag",
	emptyLabel = "No matching tags found.",
}: DatabaseTagPickerProps) {
	const [open, setOpen] = useState(false);
	const selectedTag = normalizedSelection(value);
	const selectedLabel = selectedTag ? formatTagLabel(selectedTag) : placeholder;

	return (
		<Popover open={open} onOpenChange={setOpen} modal={false}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					className="databasePickerTrigger"
				>
					<span className="databasePickerTriggerIcon">
						<Hash size="var(--icon-sm)" />
					</span>
					<span className="databasePickerTriggerText">
						<span className="databasePickerTriggerLabel">{selectedLabel}</span>
						<span className="databasePickerTriggerMeta">
							{selectedTag ? "Selected tag" : "Open tag picker"}
						</span>
					</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent className="databasePickerPopover" align="start">
				<DatabaseTagPickerPanel
					selectedValue={value}
					label={label}
					description={description}
					emptyLabel={emptyLabel}
					onSelect={(tag) => {
						onChange(tag);
						setOpen(false);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}
