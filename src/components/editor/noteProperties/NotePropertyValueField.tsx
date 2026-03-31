import type { NoteProperty, TagCount } from "../../../lib/tauri";
import { X } from "../../Icons";
import { Toggle } from "../../base/toggle/toggle";
import { Input } from "../../ui/shadcn/input";
import {
	buildTagSuggestions,
	formatTagLabel,
	fromListText,
	listText,
} from "./utils";

interface NotePropertyValueFieldProps {
	rowId: string;
	index: number;
	property: NoteProperty;
	readOnly: boolean;
	availableTags: TagCount[];
	tagDraft: string;
	onSetTagDraft: (rowId: string, value: string) => void;
	onAddTag: (rowId: string, index: number, rawValue: string) => void;
	onRemoveTag: (index: number, tag: string) => void;
	onUpdate: (index: number, patch: Partial<NoteProperty>) => void;
	onSetTagInputRef: (rowId: string, node: HTMLInputElement | null) => void;
	tagInputRef: HTMLInputElement | null;
}

export function NotePropertyValueField({
	rowId,
	index,
	property,
	readOnly,
	availableTags,
	tagDraft,
	onSetTagDraft,
	onAddTag,
	onRemoveTag,
	onUpdate,
	onSetTagInputRef,
	tagInputRef,
}: NotePropertyValueFieldProps) {
	if (readOnly) {
		if (property.kind === "tags" || property.kind === "list") {
			return (
				<div className="notePropertyPills">
					{property.value_list.map((value, valueIndex) => (
						<span
							key={`${property.key || rowId}-${valueIndex}-${value}`}
							className="notePropertyPill"
						>
							{property.kind === "tags" ? formatTagLabel(value) : value}
						</span>
					))}
				</div>
			);
		}
		if (property.kind === "checkbox") {
			return property.value_bool ? "True" : "False";
		}
		return (
			<span style={{ color: "var(--text-primary)" }}>
				{property.value_text ?? ""}
			</span>
		);
	}

	if (property.kind === "checkbox") {
		return (
			<Toggle
				slim
				size="sm"
				className="notePropertyToggle"
				ariaLabel={property.key || "Checkbox property"}
				checked={Boolean(property.value_bool)}
				onCheckedChange={(checked) => onUpdate(index, { value_bool: checked })}
			/>
		);
	}

	if (property.kind === "tags") {
		const suggestions = buildTagSuggestions(
			availableTags,
			property.value_list,
			tagDraft,
		);
		return (
			<>
				<div
					role="presentation"
					className="notePropertyTagField"
					onMouseDown={(event) => {
						if (event.target !== event.currentTarget) return;
						event.preventDefault();
						tagInputRef?.focus();
					}}
				>
					{property.value_list.map((value, valueIndex) => (
						<button
							key={`${property.key || rowId}-${valueIndex}-${value}`}
							type="button"
							className="notePropertyToken"
							onClick={() => onRemoveTag(index, value)}
							title={`Remove ${formatTagLabel(value)}`}
						>
							<span>{formatTagLabel(value)}</span>
							<X size={10} />
						</button>
					))}
					<input
						ref={(node) => onSetTagInputRef(rowId, node)}
						type="text"
						className="notePropertyTagInput"
						value={tagDraft}
						placeholder={property.value_list.length > 0 ? "" : "Add a tag"}
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
							const lastTag =
								property.value_list[property.value_list.length - 1];
							if (!lastTag) return;
							event.preventDefault();
							onRemoveTag(index, lastTag);
						}}
					/>
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

	if (property.kind === "list") {
		return (
			<Input
				className="notePropertyFieldInput"
				style={{ color: "var(--text-primary)" }}
				value={listText(property)}
				placeholder="item1, item2"
				onChange={(event) =>
					onUpdate(index, {
						value_list: fromListText(event.target.value),
					})
				}
			/>
		);
	}

	if (property.kind === "yaml") {
		return (
			<textarea
				className="notePropertyYamlInput"
				value={property.value_text ?? ""}
				onChange={(event) =>
					onUpdate(index, { value_text: event.target.value })
				}
			/>
		);
	}

	return (
		<Input
			className="notePropertyFieldInput"
			style={{ color: "var(--text-primary)" }}
			type={
				property.kind === "number"
					? "number"
					: property.kind === "date"
						? "date"
						: property.kind === "datetime"
							? "text"
							: property.kind === "url"
								? "url"
								: "text"
			}
			value={property.value_text ?? ""}
			placeholder="Value"
			onChange={(event) => onUpdate(index, { value_text: event.target.value })}
		/>
	);
}
