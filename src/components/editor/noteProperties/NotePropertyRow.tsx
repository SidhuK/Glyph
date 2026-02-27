import type { NoteProperty, TagCount } from "../../../lib/tauri";
import { X } from "../../Icons";
import { Button } from "../../ui/shadcn/button";
import { Input } from "../../ui/shadcn/input";
import { NotePropertyValueField } from "./NotePropertyValueField";
import { PropertyKindBadge } from "./PropertyKindBadge";

interface NotePropertyRowProps {
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
	onSetTagDraft,
	onAddTag,
	onRemoveTag,
	onUpdate,
	onRemove,
	onSetTagInputRef,
	tagInputRef,
}: NotePropertyRowProps) {
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
							onSetTagDraft={onSetTagDraft}
							onAddTag={onAddTag}
							onRemoveTag={onRemoveTag}
							onUpdate={onUpdate}
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
							value={property.key}
							className="notePropertyKeyInput"
							placeholder="Property"
							onChange={(event) => onUpdate(index, { key: event.target.value })}
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
							onSetTagDraft={onSetTagDraft}
							onAddTag={onAddTag}
							onRemoveTag={onRemoveTag}
							onUpdate={onUpdate}
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
						<X size={14} />
					</Button>
				</>
			)}
		</div>
	);
}
