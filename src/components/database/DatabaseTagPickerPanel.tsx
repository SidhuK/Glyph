import { useMemo, useState } from "react";
import { useFileTreeContext } from "../../contexts";
import { Search, Tags } from "../Icons";
import {
	formatTagLabel,
	normalizeTagToken,
} from "../editor/noteProperties/utils";
import { Input } from "../ui/shadcn/input";
import {
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
} from "../ui/shadcn/popover";
import { ScrollArea } from "../ui/shadcn/scroll-area";
import {
	buildDatabaseTagPickerExplicitTags,
	buildDatabaseTagPickerOptions,
} from "./databaseTagPickerOptions";

export interface DatabaseTagPickerPanelProps {
	selectedValue?: string | null;
	label: string;
	description: string;
	emptyLabel?: string;
	onSelect: (tag: string) => void;
}

export function DatabaseTagPickerPanel({
	selectedValue = null,
	label,
	description,
	emptyLabel = "No matching tags found.",
	onSelect,
}: DatabaseTagPickerPanelProps) {
	const { tags } = useFileTreeContext();
	const [query, setQuery] = useState("");

	const selectedTag = selectedValue ? normalizeTagToken(selectedValue) : null;
	const options = useMemo(
		() => buildDatabaseTagPickerOptions(tags, query),
		[query, tags],
	);
	const explicitTags = useMemo(
		() => buildDatabaseTagPickerExplicitTags(tags),
		[tags],
	);
	const manualTag = normalizeTagToken(query);
	const hasExactOption = explicitTags.some((tag) => tag === manualTag);

	const handleSelect = (tag: string) => {
		const normalizedTag = normalizeTagToken(tag) ?? tag;
		onSelect(formatTagLabel(normalizedTag));
		setQuery("");
	};

	return (
		<div className="databasePickerPanel">
			<PopoverHeader className="databasePickerHeader">
				<div className="databasePickerEyebrow">
					<Tags size="var(--icon-sm)" />
					<span>Tags</span>
				</div>
				<PopoverTitle>{label}</PopoverTitle>
				<PopoverDescription>{description}</PopoverDescription>
			</PopoverHeader>
			<div className="databasePickerSearch">
				<Search size="var(--icon-sm)" />
				<Input
					value={query}
					placeholder="Search tags"
					onChange={(event) => setQuery(event.target.value)}
					onKeyDown={(event) => {
						if (event.key !== "Enter" || !manualTag) return;
						event.preventDefault();
						handleSelect(manualTag);
					}}
				/>
			</div>
			<ScrollArea className="databasePickerResults">
				<div className="databasePickerList">
					{options.length > 0
						? options.map(({ tag }) => {
								const normalizedTag = normalizeTagToken(tag) ?? tag;
								const active = normalizedTag === selectedTag;
								return (
									<button
										key={tag}
										type="button"
										className="databasePickerOption"
										data-active={active ? "true" : undefined}
										onClick={() => handleSelect(normalizedTag)}
									>
										<span className="databasePickerOptionMain">
											<span className="databasePickerOptionLabel">
												{formatTagLabel(normalizedTag)}
											</span>
										</span>
									</button>
								);
							})
						: null}
					{manualTag && !hasExactOption ? (
						<button
							type="button"
							className="databasePickerOption"
							onClick={() => handleSelect(manualTag)}
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
					) : null}
					{options.length === 0 && !manualTag ? (
						<div className="databasePickerEmpty">{emptyLabel}</div>
					) : null}
				</div>
			</ScrollArea>
		</div>
	);
}
