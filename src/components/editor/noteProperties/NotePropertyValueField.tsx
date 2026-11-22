import { useDateDisplayFormat } from "../../../contexts";
import type { NoteProperty, TagCount } from "../../../lib/tauri";
import { Toggle } from "../../base/toggle/toggle";
import { PriorityPropertyPill } from "../../status/PriorityPropertyPill";
import { PropertyOptionPicker } from "../../status/PropertyOptionPicker";
import { StatusPropertyPill } from "../../status/StatusPropertyPill";
import type { EditorTextColor } from "../textColors";
import { TextPropertyValueField } from "./TextPropertyValueField";
import { WikiLinkedText } from "./WikiLinkedText";
import { NotePropertyTagField } from "./NotePropertyTagField";
import { TagPill } from "./TagPill";
import { formatPropertyDate } from "./utils";

export interface NotePropertyValueFieldProps {
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
				<PriorityPropertyPill value={property.value_text} className="notePropertyStatusStatic" />
			);
		}
		if (property.kind === "tags") {
			if (property.value_list.length === 0) {
				return <span className="notePropertyEmptyValue">—</span>;
			}
			return (
				<div className="notePropertyPills">
					{property.value_list.map((value, valueIndex) => (
						<TagPill key={`${property.key || rowId}-${valueIndex}-${value}`} tag={value} />
					))}
				</div>
			);
		}
		if (property.kind === "checkbox") {
			return <span className="notePropertyEmptyValue">{property.value_bool ? "Yes" : "No"}</span>;
		}
		if (property.kind === "date") {
			const formatted = formatPropertyDate(property.value_text ?? "", dateDisplayFormat);
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
		return (
			<NotePropertyTagField
				rowId={rowId}
				index={index}
				property={property}
				availableTags={availableTags}
				tagDraft={tagDraft}
				onSetTagDraft={onSetTagDraft}
				onAddTag={onAddTag}
				onRemoveTag={onRemoveTag}
				onSetTagInputRef={onSetTagInputRef}
				tagInputRef={tagInputRef}
			/>
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
