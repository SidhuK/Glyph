import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "../../Icons";
import type { NotePropertyValueFieldProps } from "./NotePropertyValueField";
import { TagPill } from "./TagPill";
import { buildTagSuggestions, formatTagLabel } from "./utils";

type NotePropertyTagFieldProps = Pick<
	NotePropertyValueFieldProps,
	| "rowId"
	| "index"
	| "property"
	| "availableTags"
	| "tagDraft"
	| "onSetTagDraft"
	| "onAddTag"
	| "onRemoveTag"
>;

export function NotePropertyTagField({
	rowId,
	index,
	property,
	availableTags,
	tagDraft,
	onSetTagDraft,
	onAddTag,
	onRemoveTag,
}: NotePropertyTagFieldProps) {
	const { t } = useTranslation("editor");
	const inputRef = useRef<HTMLInputElement>(null);
	const suggestions = buildTagSuggestions(availableTags, property.value_list, tagDraft);
	return (
		<>
			<div
				role="presentation"
				className="notePropertyTagField"
				onMouseDown={(event) => {
					if (event.target !== event.currentTarget) return;
					event.preventDefault();
					inputRef.current?.focus();
				}}
			>
				{property.value_list.map((value, valueIndex) => (
					<TagPill
						key={`${property.key || rowId}-${valueIndex}-${value}`}
						tag={value}
						onRemove={() => onRemoveTag(index, value)}
					/>
				))}
				<input
					ref={inputRef}
					type="text"
					className="plainTextInput notePropertyTagInput"
					value={tagDraft}
					placeholder={property.value_list.length > 0 ? "" : "Add a tag"}
					data-collapsed={property.value_list.length > 0 && !tagDraft ? "" : undefined}
					aria-label={`${property.key || "Tags"} value`}
					onChange={(event) => onSetTagDraft(rowId, event.target.value)}
					onBlur={() => onAddTag(rowId, index, tagDraft)}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === ",") {
							event.preventDefault();
							onAddTag(rowId, index, tagDraft);
							return;
						}
						if (event.key !== "Backspace" || tagDraft.length > 0) {
							return;
						}
						const lastTag = property.value_list[property.value_list.length - 1];
						if (!lastTag) return;
						event.preventDefault();
						onRemoveTag(index, lastTag);
					}}
				/>
				{property.value_list.length > 0 ? (
					<button
						type="button"
						className="notePropertyTagAdd"
						aria-label={t("properties.addTag")}
						onClick={() => inputRef.current?.focus()}
					>
						<Plus size="var(--icon-xs)" aria-hidden="true" />
					</button>
				) : null}
			</div>
			{suggestions.length > 0 ? (
				<div className="notePropertySuggestions">
					<div className="notePropertySuggestionsLabel">Suggested tags</div>
					<div className="notePropertySuggestionList">
						{suggestions.map(({ tag, count }) => (
							<button
								key={tag}
								type="button"
								className="notePropertySuggestionChip"
								onMouseDown={(event) => {
									event.preventDefault();
									onAddTag(rowId, index, tag);
								}}
							>
								<span>{formatTagLabel(tag)}</span>
								<span className="notePropertySuggestionCount">{count}</span>
							</button>
						))}
					</div>
				</div>
			) : null}
		</>
	);
}
