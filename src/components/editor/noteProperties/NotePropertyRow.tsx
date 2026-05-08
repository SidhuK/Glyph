import { useEffect, useState } from "react";
import type { NoteProperty, TagCount } from "../../../lib/tauri";
import { X } from "../../Icons";
import { Button } from "../../ui/shadcn/button";
import { Input } from "../../ui/shadcn/input";
import type { EditorTextColor } from "../textColors";
import { NotePropertyValueField } from "./NotePropertyValueField";
import { PropertyKindBadge } from "./PropertyKindBadge";

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

	useEffect(() => {
		setKeyDraft(property.key);
	}, [property.key]);

	const commitKeyDraft = () => {
		if (keyDraft === property.key) return;
		onUpdate(index, { key: keyDraft });
	};

	return (
		<div className="notePropertyRow">
			{readOnly ? (
				<>
					<div className="notePropertyIdentity">
						<PropertyKindBadge kind={property.kind} />
						<div className="notePropertyKeyStatic">{property.key}</div>
					</div>
					<div className="notePropertyValueStatic">
						<NotePropertyValueField
							rowId={rowId}
							index={index}
							property={property}
							readOnly
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
				</>
			) : (
				<>
					<div className="notePropertyIdentity">
						<PropertyKindBadge
							kind={property.kind}
							interactive
							onSelect={(kind) => onUpdate(index, { kind })}
						/>
						<Input
							value={keyDraft}
							className="notePropertyKeyInput"
							placeholder="Property"
							aria-label="Property name"
							onChange={(event) => setKeyDraft(event.target.value)}
							onBlur={commitKeyDraft}
							onKeyDown={(event) => {
								if (event.key !== "Enter") return;
								event.preventDefault();
								event.currentTarget.blur();
							}}
						/>
					</div>
					<div className="notePropertyValue">
						<NotePropertyValueField
							rowId={rowId}
							index={index}
							property={property}
							readOnly={false}
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
					<Button
						type="button"
						size="icon-sm"
						variant="ghost"
						className="notePropertyRemoveButton"
						onClick={() => onRemove(index)}
						aria-label={`Remove ${property.key || "property"}`}
					>
						<X size={10} />
					</Button>
				</>
			)}
		</div>
	);
}
