import type { NoteProperty, TagCount } from "../../../lib/tauri";
import { X } from "../../Icons";
import { Input } from "../../ui/shadcn/input";
import {
	buildTagSuggestions,
	formatTagLabel,
	fromListText,
	listText,
} from "./utils";

interface NotePropertyValueFieldProps {
	index: number;
	property: NoteProperty;
	readOnly: boolean;
	availableTags: TagCount[];
	tagDraft: string;
	onSetTagDraft: (index: number, value: string) => void;
	onAddTag: (index: number, rawValue: string) => void;
	onRemoveTag: (index: number, tag: string) => void;
	onUpdate: (index: number, patch: Partial<NoteProperty>) => void;
	onSetTagInputRef: (index: number, node: HTMLInputElement | null) => void;
	tagInputRef: HTMLInputElement | null;
}

export function NotePropertyValueField({
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
					{property.value_list.map((value) => (
						<span key={value} className="notePropertyPill">
							{property.kind === "tags" ? formatTagLabel(value) : value}
						</span>
					))}
				</div>
			);
		}
		if (property.kind === "checkbox") {
			return property.value_bool ? "True" : "False";
		}
		return property.value_text ?? "";
	}

	if (property.kind === "checkbox") {
		return (
			<label className="settingsToggle notePropertyToggle">
				<input
					type="checkbox"
					checked={Boolean(property.value_bool)}
					onChange={(event) =>
						onUpdate(index, { value_bool: event.target.checked })
					}
				/>
				<span aria-hidden />
			</label>
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
					className="notePropertyTagField"
					onMouseDown={(event) => {
						if (event.target !== event.currentTarget) return;
						event.preventDefault();
						tagInputRef?.focus();
					}}
				>
					{property.value_list.map((value) => (
						<button
							key={value}
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
						ref={(node) => onSetTagInputRef(index, node)}
						type="text"
						className="notePropertyTagInput"
						value={tagDraft}
						placeholder={property.value_list.length > 0 ? "" : "Add a tag"}
						onChange={(event) => onSetTagDraft(index, event.target.value)}
						onBlur={() => onAddTag(index, tagDraft)}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === ",") {
								event.preventDefault();
								onAddTag(index, tagDraft);
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
										onAddTag(index, tag);
									}}
								>
									<span>{formatTagLabel(tag)}</span>
									<span className="notePropertySuggestionCount mono">
										{count}
									</span>
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
			<>
				<Input
					className="notePropertyFieldInput"
					value={listText(property)}
					placeholder="item1, item2"
					onChange={(event) =>
						onUpdate(index, {
							value_list: fromListText(event.target.value),
						})
					}
				/>
				<div className="notePropertyPills">
					{property.value_list.map((value) => (
						<span key={value} className="notePropertyPill">
							{value}
						</span>
					))}
				</div>
			</>
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
			type={
				property.kind === "number"
					? "number"
					: property.kind === "date"
						? "date"
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
