import { useState } from "react";
import type { useFileTreeContext } from "../../contexts";
import { Hash } from "../Icons";
import {
	buildTagSuggestions,
	formatTagLabel,
	normalizeTagDraftPrefix,
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

export function buildDatabaseTagPickerOptions(
	tags: ReturnType<typeof useFileTreeContext>["tags"],
	query: string,
	limit = Number.POSITIVE_INFINITY,
): Array<{ tag: string }> {
	const trimmed = query.trim();
	if (trimmed.length >= 2) {
		const suggestions = buildTagSuggestions(tags, [], trimmed, limit);
		if (suggestions.length > 0) {
			return suggestions.map(({ tag }) => ({ tag }));
		}
	}

	const normalizedQuery = normalizeTagDraftPrefix(trimmed);
	return tags
		.filter(
			({ tag, is_explicit }) =>
				is_explicit &&
				(normalizedQuery.length === 0 ||
					tag.toLowerCase().includes(normalizedQuery)),
		)
		.map(({ tag }) => ({ tag }))
		.slice(0, limit);
}

export function buildDatabaseTagPickerExplicitTags(
	tags: ReturnType<typeof useFileTreeContext>["tags"],
): string[] {
	return tags.filter(({ is_explicit }) => is_explicit).map(({ tag }) => tag);
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
