import type { CSSProperties } from "react";
import { useDateDisplayFormat } from "../../../contexts";
import type { NoteProperty, TagCount } from "../../../lib/tauri";
import { X } from "../../Icons";
import { Toggle } from "../../base/toggle/toggle";
import { PriorityPropertyPill } from "../../status/PriorityPropertyPill";
import { PropertyOptionPicker } from "../../status/PropertyOptionPicker";
import { StatusPropertyPill } from "../../status/StatusPropertyPill";
import type { EditorTextColor } from "../textColors";
import { TextPropertyValueField } from "./TextPropertyValueField";
import { WikiLinkedText } from "./WikiLinkedText";
import {
	buildTagSuggestions,
	formatPropertyDate,
	formatTagLabel,
	tagHueFromName,
} from "./utils";

interface NotePropertyValueFieldProps {
	rowId: string;
	index: number;
	property: NoteProperty;
	readOnly: boolean;
	sourcePath?: string | null;
	availableTags: TagCount[];
	tagDraft: string;
	statusColors: Record<string, EditorTextColor>;
	onSetTagDraft: (rowId: string, value: string) => void;
	onAddTag: (rowId: string, index: number, rawValue: string) => void;
	onRemoveTag: (index: number, tag: string) => void;
	onUpdate: (index: number, patch: Partial<NoteProperty>) => void;
	onStatusColorChange: (status: string, color: EditorTextColor | null) => void;
	onSetTagInputRef: (rowId: string, node: HTMLInputElement | null) => void;
	tagInputRef: HTMLInputElement | null;
}

export function NotePropertyValueField({
	rowId,
	index,
	property,
	readOnly,
	sourcePath,
	availableTags,
	tagDraft,
	statusColors,
	onSetTagDraft,
	onAddTag,
	onRemoveTag,
	onUpdate,
	onStatusColorChange,
	onSetTagInputRef,
	tagInputRef,
}: NotePropertyValueFieldProps) {
	const dateDisplayFormat = useDateDisplayFormat();

	if (readOnly) {
		if (property.kind === "status") {
			return (
				<StatusPropertyPill
					value={property.value_text}
					colors={statusColors}
					className="notePropertyStatusStatic"
				/>
			);
		}
		if (property.kind === "priority") {
			return (
				<PriorityPropertyPill
					value={property.value_text}
					className="notePropertyStatusStatic"
				/>
			);
		}
		if (property.kind === "tags") {
			if (property.value_list.length === 0) {
				return <span className="notePropertyEmptyValue">—</span>;
			}
			return (
				<div className="notePropertyPills">
					{property.value_list.map((value, valueIndex) => {
						const hue = tagHueFromName(value);
						return (
							<span
								key={`${property.key || rowId}-${valueIndex}-${value}`}
								className="notePropertyPill"
								style={
									{
										"--tag-pill-hue": `${hue}`,
									} as CSSProperties
								}
							>
								{value.startsWith("#") ? value.slice(1) : value}
							</span>
						);
					})}
				</div>
			);
		}
		if (property.kind === "checkbox") {
			return (
				<span className="notePropertyEmptyValue">
					{property.value_bool ? "Yes" : "No"}
				</span>
			);
		}
		if (property.kind === "date") {
			const formatted = formatPropertyDate(
				property.value_text ?? "",
				dateDisplayFormat,
			);
			if (!formatted) {
				return <span className="notePropertyEmptyValue">—</span>;
			}
			return <span className="notePropertyDateValue">{formatted}</span>;
		}
		if (property.kind === "url") {
			const url = property.value_text ?? "";
			if (!url) {
				return <span className="notePropertyEmptyValue">—</span>;
			}
			return (
				<a
					href={url}
					target="_blank"
					rel="noopener noreferrer"
					className="notePropertyLinkValue"
					onClick={(event) => event.stopPropagation()}
				>
					{url}
				</a>
			);
		}
		const text = property.value_text ?? "";
		if (!text) {
			return <span className="notePropertyEmptyValue">—</span>;
		}
		return (
			<span className="notePropertyTextValue">
				<WikiLinkedText value={text} sourcePath={sourcePath} />
			</span>
		);
	}

	if (property.kind === "status") {
		const currentValue = property.value_text ?? "";
		return (
			<PropertyOptionPicker
				kind="status"
				value={currentValue}
				colors={statusColors}
				triggerClassName="notePropertyStatusTrigger"
				triggerAriaLabel={property.key || "Status property"}
				onChange={(value) => onUpdate(index, { value_text: value })}
				onColorChange={onStatusColorChange}
			/>
		);
	}

	if (property.kind === "priority") {
		const currentValue = property.value_text ?? "";
		return (
			<PropertyOptionPicker
				kind="priority"
				value={currentValue}
				triggerClassName="notePropertyStatusTrigger"
				triggerAriaLabel={property.key || "Priority property"}
				onChange={(value) => onUpdate(index, { value_text: value })}
			/>
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
					{property.value_list.map((value, valueIndex) => {
						const hue = tagHueFromName(value);
						const label = value.startsWith("#") ? value.slice(1) : value;
						return (
							<button
								key={`${property.key || rowId}-${valueIndex}-${value}`}
								type="button"
								className="notePropertyToken"
								style={
									{
										"--tag-pill-hue": `${hue}`,
									} as CSSProperties
								}
								onClick={() => onRemoveTag(index, value)}
								title={`Remove ${label}`}
								aria-label={`Remove ${label}`}
							>
								<span>{label}</span>
								<X size="var(--icon-xs)" />
							</button>
						);
					})}
					<input
						ref={(node) => onSetTagInputRef(rowId, node)}
						type="text"
						className="plainTextInput notePropertyTagInput"
						value={tagDraft}
						placeholder={property.value_list.length > 0 ? "" : "Add a tag"}
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

	return (
		<TextPropertyValueField
			key={`${property.kind}:${property.value_text ?? ""}`}
			property={property}
			sourcePath={sourcePath}
			onUpdate={(patch) => onUpdate(index, patch)}
		/>
	);
}
