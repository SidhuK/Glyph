import { useEffect, useState } from "react";
import type { NoteProperty, TagCount } from "../../../lib/tauri";
import { X } from "../../Icons";
import { Button } from "../../ui/shadcn/button";
import { Input } from "../../ui/shadcn/input";
import type { EditorTextColor } from "../textColors";
import { NotePropertyValueField } from "./NotePropertyValueField";
import { PropertyKindBadge } from "./PropertyKindBadge";
import { humanizePropertyKey } from "./utils";

interface NotePropertyRowProps {
	rowId: string;
	index: number;
	property: NoteProperty;
	readOnly: boolean;
	availableTags: TagCount[];
	tagDraft: string;
	statusColors: Record<string, EditorTextColor>;
	onSetTagDraft: (rowId: string, value: string) => void;
	onAddTag: (rowId: string, index: number, rawValue: string) => void;
	onRemoveTag: (index: number, tag: string) => void;
	onUpdate: (index: number, patch: Partial<NoteProperty>) => void;
	onStatusColorChange: (status: string, color: EditorTextColor | null) => void;
	onRemove: (index: number) => void;
	onSetTagInputRef: (rowId: string, node: HTMLInputElement | null) => void;
	tagInputRef: HTMLInputElement | null;
}

export function NotePropertyRow({
	rowId,
	index,
	property,
	readOnly,
	availableTags,
	tagDraft,
	statusColors,
	onSetTagDraft,
	onAddTag,
	onRemoveTag,
	onUpdate,
	onStatusColorChange,
	onRemove,
	onSetTagInputRef,
	tagInputRef,
}: NotePropertyRowProps) {
	const [keyDraft, setKeyDraft] = useState(property.key);
	const [editingKey, setEditingKey] = useState(false);

	useEffect(() => {
		setKeyDraft(property.key);
	}, [property.key]);

	const commitKeyDraft = () => {
		setEditingKey(false);
		if (keyDraft === property.key) return;
		onUpdate(index, { key: keyDraft });
	};

	return (
		<div className="notePropertyRow">
			<div className="notePropertyIdentity">
				<PropertyKindBadge
					kind={property.kind}
					interactive={!readOnly}
					onSelect={(kind) => onUpdate(index, { kind })}
				/>
				<div className="notePropertyKeyWrap">
					{editingKey && !readOnly ? (
						<Input
							value={keyDraft}
							className="plainTextInput notePropertyKeyInput"
							placeholder="Key"
							aria-label="Property name"
							onChange={(event) => setKeyDraft(event.target.value)}
							onBlur={commitKeyDraft}
							onKeyDown={(event) => {
								if (event.key !== "Enter") return;
								event.preventDefault();
								event.currentTarget.blur();
							}}
							autoFocus
						/>
					) : (
						<button
							type="button"
							className="notePropertyKeyLabel"
							onClick={() => {
								if (!readOnly) setEditingKey(true);
							}}
							disabled={readOnly}
						>
							{humanizePropertyKey(property.key) || (
								<span className="notePropertyKeyPlaceholder">Property</span>
							)}
						</button>
					)}
				</div>
			</div>
			<div className="notePropertyValueWrap">
				<NotePropertyValueField
					rowId={rowId}
					index={index}
					property={property}
					readOnly={readOnly}
					availableTags={availableTags}
					tagDraft={tagDraft}
					statusColors={statusColors}
					onSetTagDraft={onSetTagDraft}
					onAddTag={onAddTag}
					onRemoveTag={onRemoveTag}
					onUpdate={onUpdate}
					onStatusColorChange={onStatusColorChange}
					onSetTagInputRef={onSetTagInputRef}
					tagInputRef={tagInputRef}
				/>
			</div>
			{!readOnly ? (
				<Button
					type="button"
					size="icon-sm"
					variant="ghost"
					className="notePropertyRemoveButton"
					onClick={() => onRemove(index)}
					aria-label={`Remove ${property.key || "property"}`}
				>
					<X size="var(--icon-xs)" />
				</Button>
			) : null}
		</div>
	);
}
