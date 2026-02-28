import { useEffect, useMemo, useRef, useState } from "react";
import { useFileTreeContext } from "../../contexts";
import {
	databaseCellValueFromRow,
	formatDatabaseDateTime,
	isColumnEditable,
} from "../../lib/database/config";
import type { DatabaseColumn, DatabaseRow } from "../../lib/database/types";
import { extractErrorMessage } from "../../lib/errorUtils";
import { X } from "../Icons";
import {
	buildTagSuggestions,
	formatTagLabel,
	normalizeTagToken,
} from "../editor/noteProperties/utils";
import { Input } from "../ui/shadcn/input";

interface DatabaseCellProps {
	row: DatabaseRow;
	column: DatabaseColumn;
	onOpenNote?: (notePath: string) => void;
	onSelectRow?: (notePath: string) => void;
	onSave: (
		notePath: string,
		column: DatabaseColumn,
		nextValue: ReturnType<typeof databaseCellValueFromRow>,
	) => Promise<void>;
}

function listDraft(row: DatabaseRow, column: DatabaseColumn): string {
	const value = databaseCellValueFromRow(row, column);
	return value.value_list.join(", ");
}

export function DatabaseCell({
	row,
	column,
	onOpenNote,
	onSelectRow,
	onSave,
}: DatabaseCellProps) {
	const { tags: availableTags } = useFileTreeContext();
	const editable = isColumnEditable(column);
	const cellValue = useMemo(
		() => databaseCellValueFromRow(row, column),
		[column, row],
	);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const tagInputRef = useRef<HTMLInputElement | null>(null);
	const tagFieldRef = useRef<HTMLDivElement | null>(null);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(
		cellValue.value_text ?? listDraft(row, column),
	);
	const [tagDraft, setTagDraft] = useState("");
	const [saveError, setSaveError] = useState("");
	const isTagsColumn =
		column.type === "tags" || column.property_kind === "tags";
	const tagSuggestions = useMemo(
		() => buildTagSuggestions(availableTags, cellValue.value_list, tagDraft),
		[availableTags, cellValue.value_list, tagDraft],
	);

	useEffect(() => {
		setDraft(cellValue.value_text ?? listDraft(row, column));
		setTagDraft("");
	}, [cellValue, column, row]);

	useEffect(() => {
		if (!editing) return;
		window.requestAnimationFrame(() => {
			if (isTagsColumn) {
				tagInputRef.current?.focus();
				return;
			}
			inputRef.current?.focus();
			inputRef.current?.select();
		});
	}, [editing, isTagsColumn]);

	const commit = async () => {
		if (!editable) return;
		setEditing(false);
		if (column.type === "tags" || column.property_kind === "tags") {
			await onSave(row.note_path, column, {
				kind: column.property_kind ?? "tags",
				value_list: draft
					.split(",")
					.map((value) => value.trim())
					.filter(Boolean),
			});
			return;
		}
		if (column.property_kind === "list") {
			await onSave(row.note_path, column, {
				kind: "list",
				value_list: draft
					.split(",")
					.map((value) => value.trim())
					.filter(Boolean),
			});
			return;
		}
		await onSave(row.note_path, column, {
			kind: cellValue.kind,
			value_text: draft,
			value_bool: cellValue.value_bool ?? null,
			value_list: cellValue.value_list,
		});
	};

	const handleSelectRow = () => {
		onSelectRow?.(row.note_path);
	};
	const displayText =
		cellValue.kind === "datetime"
			? formatDatabaseDateTime(cellValue.value_text)
			: (cellValue.value_text ?? "");

	const saveTagList = async (values: string[]) => {
		setSaveError("");
		await onSave(row.note_path, column, {
			kind: column.property_kind ?? "tags",
			value_list: values,
		});
	};

	const addTag = async (rawValue: string) => {
		const nextTag = normalizeTagToken(rawValue);
		if (!nextTag) return;
		const currentTags = cellValue.value_list.map(
			(value) => normalizeTagToken(value) ?? value,
		);
		if (currentTags.includes(nextTag)) {
			setTagDraft("");
			return;
		}
		setTagDraft("");
		await saveTagList([...currentTags, nextTag]);
	};

	const removeTag = async (tagToRemove: string) => {
		const normalizedTag = normalizeTagToken(tagToRemove) ?? tagToRemove;
		await saveTagList(
			cellValue.value_list.filter(
				(value) => (normalizeTagToken(value) ?? value) !== normalizedTag,
			),
		);
	};

	if (column.type === "property" && column.property_kind === "checkbox") {
		return (
			<div
				className="settingsToggle notePropertyToggle databaseCheckboxCell"
				onClick={(event) => {
					handleSelectRow();
					event.stopPropagation();
				}}
				onKeyDown={(event) => event.stopPropagation()}
			>
				<input
					type="checkbox"
					checked={Boolean(cellValue.value_bool)}
					onFocus={handleSelectRow}
					onChange={(event) =>
						void onSave(row.note_path, column, {
							kind: "checkbox",
							value_bool: event.target.checked,
							value_list: [],
						})
					}
				/>
				<span aria-hidden />
			</div>
		);
	}

	if (!editing || !editable) {
		if (cellValue.kind === "tags") {
			return (
				<button
					type="button"
					className="databaseCellButton"
					onDoubleClick={() => setEditing(true)}
					onClick={(event) => {
						handleSelectRow();
						event.stopPropagation();
					}}
					title="Double-click to edit tags"
				>
					<div className="databaseCellPills">
						{cellValue.value_list.length > 0
							? cellValue.value_list.map((value) => (
									<span
										key={`${column.id}:${value}`}
										className="databaseCellPill"
									>
										{formatTagLabel(value)}
									</span>
								))
							: null}
					</div>
				</button>
			);
		}
		if (cellValue.kind === "list") {
			return (
				<button
					type="button"
					className="databaseCellButton"
					onDoubleClick={() => {
						if (editable) setEditing(true);
					}}
					onClick={(event) => {
						handleSelectRow();
						event.stopPropagation();
					}}
					title="Double-click to edit"
				>
					<div className="databaseCellPills">
						{cellValue.value_list.length > 0
							? cellValue.value_list.map((value) => (
									<span
										key={`${column.id}:${value}`}
										className="databaseCellPill"
									>
										{value}
									</span>
								))
							: null}
					</div>
				</button>
			);
		}
		if (column.type === "property" && column.property_kind === "yaml") {
			if (!cellValue.value_text?.trim()) return null;
			return (
				<pre className="databaseCellYaml">{cellValue.value_text.trim()}</pre>
			);
		}
		return (
			<button
				type="button"
				className={[
					"databaseCellButton",
					column.type === "title" ? "is-title" : "",
					!editable ? "is-readonly" : "",
				]
					.filter(Boolean)
					.join(" ")}
				onDoubleClick={() => {
					if (column.type === "title") {
						onOpenNote?.(row.note_path);
						return;
					}
					if (editable) setEditing(true);
				}}
				onClick={(event) => {
					handleSelectRow();
					event.stopPropagation();
				}}
				title={
					column.type === "title"
						? "Double-click to open note"
						: editable
							? "Double-click to edit"
							: undefined
				}
			>
				{displayText.trim() ? (
					<span className="databaseCellText">{displayText}</span>
				) : null}
			</button>
		);
	}

	if (isTagsColumn) {
		return (
			<div className="databaseTagEditor">
				<div
					ref={tagFieldRef}
					className="notePropertyTagField databaseTagField"
					onMouseDown={(event) => {
						handleSelectRow();
						if (event.target !== event.currentTarget) return;
						event.preventDefault();
						tagInputRef.current?.focus();
					}}
				>
					{cellValue.value_list.map((value, valueIndex) => (
						<button
							key={`${column.id}:${valueIndex}:${value}`}
							type="button"
							className="notePropertyToken"
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => void removeTag(value)}
							title={`Remove ${formatTagLabel(value)}`}
						>
							<span>{formatTagLabel(value)}</span>
							<X size={10} />
						</button>
					))}
					<input
						ref={tagInputRef}
						type="text"
						className="notePropertyTagInput"
						value={tagDraft}
						placeholder={
							cellValue.value_list.length > 0 ? "" : "Add or choose a tag"
						}
						onFocus={handleSelectRow}
						onChange={(event) => setTagDraft(event.target.value)}
						onBlur={(event) => {
							const relatedTarget = event.relatedTarget as Node | null;
							if (
								relatedTarget &&
								tagFieldRef.current?.contains(relatedTarget)
							) {
								return;
							}
							void (async () => {
								try {
									if (tagDraft.trim()) {
										await addTag(tagDraft);
									}
								} catch (error) {
									console.error("Failed to save database tags on blur", error);
									setSaveError(extractErrorMessage(error));
								} finally {
									setEditing(false);
								}
							})();
						}}
						onClick={(event) => {
							handleSelectRow();
							event.stopPropagation();
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === ",") {
								event.preventDefault();
								void addTag(tagDraft);
								return;
							}
							if (event.key === "Escape") {
								event.preventDefault();
								setTagDraft("");
								setEditing(false);
								return;
							}
							if (event.key !== "Backspace" || tagDraft.length > 0) {
								return;
							}
							const lastTag =
								cellValue.value_list[cellValue.value_list.length - 1];
							if (!lastTag) return;
							event.preventDefault();
							void removeTag(lastTag);
						}}
					/>
				</div>
				{tagSuggestions.length > 0 ? (
					<div className="notePropertySuggestions databaseTagSuggestions">
						<div className="notePropertySuggestionsLabel">Suggested tags</div>
						<div className="notePropertySuggestionList">
							{tagSuggestions.map(({ tag, count }) => (
								<button
									key={tag}
									type="button"
									className="notePropertySuggestionChip"
									onMouseDown={async (event) => {
										event.preventDefault();
										try {
											await addTag(tag);
										} catch (error) {
											console.error(
												"Failed to add suggested database tag",
												error,
											);
											setSaveError(extractErrorMessage(error));
										}
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
				{saveError ? (
					<div className="databaseCellError">{saveError}</div>
				) : null}
			</div>
		);
	}

	return (
		<Input
			ref={inputRef}
			className="databaseCellInput"
			type={
				column.property_kind === "number"
					? "number"
					: column.property_kind === "url"
						? "url"
						: "text"
			}
			value={draft}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={() => void commit()}
			onFocus={handleSelectRow}
			onClick={(event) => {
				handleSelectRow();
				event.stopPropagation();
			}}
			onDoubleClick={(event) => event.stopPropagation()}
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					void commit();
				}
				if (event.key === "Escape") {
					event.preventDefault();
					setDraft(cellValue.value_text ?? listDraft(row, column));
					setEditing(false);
				}
			}}
		/>
	);
}
