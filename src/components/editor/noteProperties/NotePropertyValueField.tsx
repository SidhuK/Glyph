import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import {
	statusColorKey,
	statusOptionsWithCustomValues,
} from "../../../lib/statusProperties";
import type { NoteProperty, TagCount } from "../../../lib/tauri";
import { X } from "../../Icons";
import { Toggle } from "../../base/toggle/toggle";
import { StatusPropertyPill } from "../../status/StatusPropertyPill";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../ui/shadcn/dropdown-menu";
import { Input } from "../../ui/shadcn/input";
import { EDITOR_TEXT_COLORS, type EditorTextColor } from "../textColors";
import { buildTagSuggestions, formatTagLabel } from "./utils";

interface NotePropertyValueFieldProps {
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
	statusColors,
	onSetTagDraft,
	onAddTag,
	onRemoveTag,
	onUpdate,
	onStatusColorChange,
	onSetTagInputRef,
	tagInputRef,
}: NotePropertyValueFieldProps) {
	const textValue = property.value_text ?? "";
	const [textDraft, setTextDraft] = useState(textValue);

	useEffect(() => {
		setTextDraft(textValue);
	}, [textValue]);

	const commitTextDraft = () => {
		if (textDraft === textValue) return;
		onUpdate(index, { value_text: textDraft });
	};

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
		if (property.kind === "tags") {
			return (
				<div className="notePropertyPills">
					{property.value_list.map((value, valueIndex) => (
						<span
							key={`${property.key || rowId}-${valueIndex}-${value}`}
							className="notePropertyPill"
						>
							{formatTagLabel(value)}
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

	if (property.kind === "status") {
		const currentValue = property.value_text ?? "";
		const currentStatusId = statusColorKey(currentValue);
		const statusOptions = statusOptionsWithCustomValues([currentValue]);
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="notePropertyStatusTrigger"
						aria-label={property.key || "Status property"}
					>
						<StatusPropertyPill
							value={currentValue || "not_started"}
							colors={statusColors}
						/>
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					sideOffset={6}
					className="databasePickerMenu notePropertyStatusMenu"
				>
					<div className="notePropertyStatusOptions">
						{statusOptions.map((option) => (
							<DropdownMenuItem
								key={option.id}
								className="notePropertyStatusOption"
								data-selected={
									statusColorKey(option.label) === currentStatusId
										? "true"
										: "false"
								}
								onClick={() => onUpdate(index, { value_text: option.label })}
							>
								<StatusPropertyPill
									value={option.label}
									colors={statusColors}
								/>
							</DropdownMenuItem>
						))}
					</div>
					{currentStatusId ? (
						<>
							<DropdownMenuSeparator className="databaseBoardContextMenuSeparator" />
							<div className="notePropertyStatusColorRibbon">
								{EDITOR_TEXT_COLORS.map((color) => (
									<button
										key={color.id}
										type="button"
										className="databaseBoardColorRibbonSwatch"
										style={
											{
												"--database-tone": `var(${color.cssVar})`,
											} as CSSProperties
										}
										onClick={() => onStatusColorChange(currentValue, color.id)}
										title={color.label}
										aria-label={`Set ${currentValue} color to ${color.label}`}
									/>
								))}
								<button
									type="button"
									className="databaseBoardColorRibbonClear"
									onClick={() => onStatusColorChange(currentValue, null)}
									title="Clear color"
									aria-label={`Clear color for ${currentValue}`}
								>
									<span />
								</button>
							</div>
						</>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>
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
							aria-label={`Remove ${formatTagLabel(value)}`}
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
		<Input
			className="notePropertyFieldInput"
			style={{ color: "var(--text-primary)" }}
			type={
				property.kind === "date"
					? "date"
					: property.kind === "url"
						? "url"
						: "text"
			}
			value={textDraft}
			placeholder="Value"
			aria-label={`${property.key || "Property"} value`}
			onChange={(event) => setTextDraft(event.target.value)}
			onBlur={commitTextDraft}
			onKeyDown={(event) => {
				if (event.key !== "Enter") return;
				event.preventDefault();
				commitTextDraft();
				event.currentTarget.blur();
			}}
		/>
	);
}
