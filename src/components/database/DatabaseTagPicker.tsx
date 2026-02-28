import { useMemo, useState } from "react";
import { useFileTreeContext } from "../../contexts";
import { Hash, Search, Tags } from "../Icons";
import {
	buildTagSuggestions,
	formatTagLabel,
	normalizeTagToken,
} from "../editor/noteProperties/utils";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "../ui/shadcn/popover";
import { ScrollArea } from "../ui/shadcn/scroll-area";

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
	const { tags } = useFileTreeContext();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");

	const selectedTag = normalizedSelection(value);

	const options = useMemo(() => {
		const trimmed = query.trim();
		if (trimmed.length >= 2) {
			const suggestions = buildTagSuggestions(tags, [], trimmed);
			if (suggestions.length > 0) return suggestions;
		}

		const normalizedQuery = normalizeTagToken(trimmed) ?? "";
		return tags
			.filter(({ tag }) =>
				normalizedQuery.length === 0
					? true
					: tag.toLowerCase().includes(normalizedQuery),
			)
			.slice(0, 40);
	}, [query, tags]);

	const manualTag = normalizeTagToken(query);

	const selectedLabel = selectedTag ? formatTagLabel(selectedTag) : placeholder;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					className="databasePickerTrigger"
				>
					<span className="databasePickerTriggerIcon">
						<Hash size={13} />
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
				<PopoverHeader className="databasePickerHeader">
					<div className="databasePickerEyebrow">
						<Tags size={13} />
						<span>Tag Source</span>
					</div>
					<PopoverTitle>{label}</PopoverTitle>
					<PopoverDescription>{description}</PopoverDescription>
				</PopoverHeader>
				<div className="databasePickerSearch">
					<Search size={13} />
					<Input
						value={query}
						placeholder="Search tags"
						onChange={(event) => setQuery(event.target.value)}
					/>
				</div>
				<ScrollArea className="databasePickerResults">
					<div className="databasePickerList">
						{options.length > 0 ? (
							options.map(({ tag, count }) => {
								const normalizedTag = normalizeTagToken(tag) ?? tag;
								const active = normalizedTag === selectedTag;
								return (
									<button
										key={tag}
										type="button"
										className="databasePickerOption"
										data-active={active ? "true" : undefined}
										onClick={() => {
											onChange(formatTagLabel(normalizedTag));
											setOpen(false);
											setQuery("");
										}}
									>
										<span className="databasePickerOptionMain">
											<span className="databasePickerOptionLabel">
												{formatTagLabel(normalizedTag)}
											</span>
											<span className="databasePickerOptionMeta">
												Used in {count} note{count === 1 ? "" : "s"}
											</span>
										</span>
										<span className="databasePickerOptionBadge">{count}</span>
									</button>
								);
							})
						) : manualTag ? (
							<button
								type="button"
								className="databasePickerOption"
								onClick={() => {
									onChange(formatTagLabel(manualTag));
									setOpen(false);
									setQuery("");
								}}
							>
								<span className="databasePickerOptionMain">
									<span className="databasePickerOptionLabel">
										Use {formatTagLabel(manualTag)}
									</span>
									<span className="databasePickerOptionMeta">
										Add this tag value directly.
									</span>
								</span>
								<span className="databasePickerOptionBadge">New</span>
							</button>
						) : (
							<div className="databasePickerEmpty">{emptyLabel}</div>
						)}
					</div>
				</ScrollArea>
			</PopoverContent>
		</Popover>
	);
}
