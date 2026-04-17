import {
	type CSSProperties,
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useFileTreeContext } from "../../contexts";
import {
	databaseCellValueFromRow,
	formatDatabaseDateTime,
	isColumnEditable,
} from "../../lib/database/config";
import { databaseValueToneStyleForColor } from "../../lib/database/palette";
import type { DatabaseColumn, DatabaseRow } from "../../lib/database/types";
import { extractErrorMessage } from "../../lib/errorUtils";
import { X } from "../Icons";
import { Toggle } from "../base/toggle/toggle";
import { normalizeTagToken } from "../editor/noteProperties/utils";
import type { EditorTextColor } from "../editor/textColors";
import { Input } from "../ui/shadcn/input";
import { buildDatabaseTagPickerOptions } from "./DatabaseTagPicker";
import { formatDatabaseTagLabel } from "./databaseTagLabel";

const DATABASE_CELL_PILL_GAP = 6;

interface DatabaseCellProps {
	row: DatabaseRow;
	column: DatabaseColumn;
	isRowSelected?: boolean;
	laneColors?: Record<string, EditorTextColor>;
	onOpenNote?: (notePath: string) => void;
	onSelectRow?: (notePath: string) => void;
	valueOptions?: string[];
	onRenameTitle?: (notePath: string, nextTitle: string) => Promise<boolean>;
	onSave: (
		notePath: string,
		column: DatabaseColumn,
		nextValue: ReturnType<typeof databaseCellValueFromRow>,
	) => Promise<void>;
}

interface DatabaseDisplayPill {
	key: string;
	label: string;
	style?: CSSProperties;
	title?: string;
}

function ResponsivePillList({ items }: { items: DatabaseDisplayPill[] }) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const itemMeasureRefs = useRef<Array<HTMLSpanElement | null>>([]);
	const moreMeasureRefs = useRef<Array<HTMLSpanElement | null>>([]);
	const [visibleCount, setVisibleCount] = useState(0);

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		itemMeasureRefs.current = itemMeasureRefs.current.slice(0, items.length);
		moreMeasureRefs.current = moreMeasureRefs.current.slice(0, items.length);

		const measure = () => {
			const containerWidth = container.clientWidth;
			if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
				return;
			}

			const itemWidths = items.map((_, index) => {
				const element = itemMeasureRefs.current[index];
				return element ? element.getBoundingClientRect().width : 0;
			});
			const moreWidths = Array.from({ length: items.length }, (_, index) => {
				const element = moreMeasureRefs.current[index];
				return element ? element.getBoundingClientRect().width : 0;
			});

			let nextVisibleCount = 0;
			for (let candidate = items.length; candidate >= 0; candidate -= 1) {
				const hiddenCount = items.length - candidate;
				let totalWidth = 0;
				if (candidate > 0) {
					for (let index = 0; index < candidate; index += 1) {
						totalWidth += itemWidths[index] ?? 0;
					}
					totalWidth += (candidate - 1) * DATABASE_CELL_PILL_GAP;
				}
				if (hiddenCount > 0) {
					if (candidate > 0) {
						totalWidth += DATABASE_CELL_PILL_GAP;
					}
					totalWidth += moreWidths[hiddenCount - 1] ?? 0;
				}
				if (totalWidth <= containerWidth + 0.5) {
					nextVisibleCount = candidate;
					break;
				}
			}
			setVisibleCount((current) =>
				current === nextVisibleCount ? current : nextVisibleCount,
			);
		};

		const observer = new ResizeObserver(() => {
			measure();
		});
		observer.observe(container);
		measure();

		return () => {
			observer.disconnect();
		};
	}, [items]);

	useLayoutEffect(() => {
		setVisibleCount((current) => Math.min(current, items.length));
	}, [items.length]);

	const visibleItems = items.slice(0, visibleCount);
	const hiddenCount = Math.max(0, items.length - visibleCount);

	return (
		<>
			<div ref={containerRef} className="databaseCellPills">
				{visibleItems.map((item) => (
					<span
						key={item.key}
						className="databaseCellPill"
						style={item.style}
						title={item.title}
					>
						{item.label}
					</span>
				))}
				{hiddenCount > 0 ? (
					<span className="databaseCellPill databaseCellPillMore">
						+{hiddenCount}
					</span>
				) : null}
			</div>
			<div className="databaseCellPillsMeasure" aria-hidden="true">
				{items.map((item, index) => (
					<span
						key={`measure:${item.key}`}
						ref={(element) => {
							itemMeasureRefs.current[index] = element;
						}}
						className="databaseCellPill"
						style={item.style}
					>
						{item.label}
					</span>
				))}
				{Array.from({ length: items.length }, (_, index) => (
					<span
						key={`measure-more:${index + 1}`}
						ref={(element) => {
							moreMeasureRefs.current[index] = element;
						}}
						className="databaseCellPill databaseCellPillMore"
					>
						+{index + 1}
					</span>
				))}
			</div>
		</>
	);
}

const EMPTY_LANE_COLORS: Record<string, EditorTextColor> = {};

function listDraft(row: DatabaseRow, column: DatabaseColumn): string {
	const value = databaseCellValueFromRow(row, column);
	return value.value_list.join(", ");
}

function isListLikeColumn(column: DatabaseColumn): boolean {
	return (
		column.property_kind === "list" ||
		column.property_kind === "relation" ||
		column.property_kind === "multi_select"
	);
}

function uniqueValues(values: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of values) {
		const trimmed = raw.trim();
		if (!trimmed) continue;
		const key = trimmed.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(trimmed);
	}
	return out;
}

interface DatabaseCellEditorProps extends DatabaseCellProps {
	onClose: () => void;
}

function DatabaseCellEditor({
	row,
	column,
	laneColors = EMPTY_LANE_COLORS,
	onSelectRow,
	valueOptions = [],
	onRenameTitle,
	onSave,
	onClose,
}: DatabaseCellEditorProps) {
	const { tags: availableTags } = useFileTreeContext();
	const cellValue = useMemo(
		() => databaseCellValueFromRow(row, column),
		[column, row],
	);
	const [draft, setDraft] = useState(
		() => cellValue.value_text ?? listDraft(row, column),
	);
	const [tagDraft, setTagDraft] = useState("");
	const [valueDraft, setValueDraft] = useState("");
	const [saveError, setSaveError] = useState("");
	const tagFieldRef = useRef<HTMLDivElement | null>(null);
	const tagInputRef = useRef<HTMLInputElement | null>(null);
	const valueFieldRef = useRef<HTMLDivElement | null>(null);
	const valueInputRef = useRef<HTMLInputElement | null>(null);
	const focusTagInput = useCallback((element: HTMLInputElement | null) => {
		tagInputRef.current = element;
		if (element) {
			element.focus();
		}
	}, []);
	const focusValueInput = useCallback((element: HTMLInputElement | null) => {
		valueInputRef.current = element;
		if (element) {
			element.focus();
		}
	}, []);
	const focusTextInput = useCallback((element: HTMLInputElement | null) => {
		if (element) {
			element.focus();
			element.select();
		}
	}, []);
	const isTagsColumn =
		column.type === "tags" || column.property_kind === "tags";
	const isListLike = isListLikeColumn(column);
	const toneStyleForValue = (value: string) =>
		databaseValueToneStyleForColor(value, laneColors[value] ?? null);
	const tagSuggestions = useMemo(() => {
		const selectedTags = new Set(
			cellValue.value_list
				.map((value) => normalizeTagToken(value))
				.filter((value): value is string => Boolean(value)),
		);
		return buildDatabaseTagPickerOptions(availableTags, tagDraft)
			.filter(({ tag }) => !selectedTags.has(tag))
			.slice(0, 8);
	}, [availableTags, cellValue.value_list, tagDraft]);
	const valueSuggestions = useMemo(() => {
		if (!isListLike) return [];
		const query = valueDraft.trim().toLowerCase();
		const selected = new Set(
			cellValue.value_list.map((value) => value.trim().toLowerCase()),
		);
		return uniqueValues(valueOptions)
			.filter((value) => {
				const key = value.trim().toLowerCase();
				if (!key || selected.has(key)) return false;
				if (!query) return true;
				return key.includes(query);
			})
			.slice(0, 8);
	}, [cellValue.value_list, isListLike, valueDraft, valueOptions]);
	const textSuggestions = useMemo(() => {
		if (column.type === "title" || valueOptions.length === 0) return [];
		const currentValue = draft.trim().toLowerCase();
		return uniqueValues(valueOptions)
			.filter((value) => {
				const normalized = value.trim().toLowerCase();
				if (!normalized || normalized === currentValue) return false;
				return currentValue.length === 0 || normalized.includes(currentValue);
			})
			.slice(0, 6);
	}, [column.type, draft, valueOptions]);

	const handleSelectRow = () => {
		onSelectRow?.(row.note_path);
	};

	const handleTagSaveError = (error: unknown) => {
		setSaveError(extractErrorMessage(error));
	};

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

	const saveListValues = async (values: string[]) => {
		setSaveError("");
		await onSave(row.note_path, column, {
			kind: column.property_kind ?? cellValue.kind,
			value_list: uniqueValues(values),
		});
	};

	const addListValue = async (rawValue: string) => {
		const next = rawValue.trim();
		if (!next) return;
		const currentValues = uniqueValues(cellValue.value_list);
		const lowerCurrent = new Set(
			currentValues.map((value) => value.trim().toLowerCase()),
		);
		if (lowerCurrent.has(next.toLowerCase())) {
			setValueDraft("");
			return;
		}
		setValueDraft("");
		await saveListValues([...currentValues, next]);
	};

	const removeListValue = async (valueToRemove: string) => {
		const normalized = valueToRemove.trim().toLowerCase();
		await saveListValues(
			cellValue.value_list.filter(
				(value) => value.trim().toLowerCase() !== normalized,
			),
		);
	};

	const commitText = async () => {
		setSaveError("");
		try {
			if (column.type === "title" && onRenameTitle) {
				const renamed = await onRenameTitle(row.note_path, draft.trim());
				if (!renamed) return;
				onClose();
				return;
			}
			if (column.type === "tags" || column.property_kind === "tags") {
				await onSave(row.note_path, column, {
					kind: column.property_kind ?? "tags",
					value_list: draft
						.split(",")
						.map((value) => value.trim())
						.filter(Boolean),
				});
				onClose();
				return;
			}
			if (isListLike) {
				await onSave(row.note_path, column, {
					kind: column.property_kind ?? cellValue.kind,
					value_list: draft
						.split(",")
						.map((value) => value.trim())
						.filter(Boolean),
				});
				onClose();
				return;
			}
			await onSave(row.note_path, column, {
				kind: cellValue.kind,
				value_text: draft,
				value_bool: cellValue.value_bool ?? null,
				value_list: cellValue.value_list,
			});
			onClose();
		} catch (error) {
			setSaveError(extractErrorMessage(error));
		}
	};

	if (isTagsColumn) {
		return (
			<div className="databaseTagEditor">
				<div
					ref={tagFieldRef}
					role="presentation"
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
							style={toneStyleForValue(value)}
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => {
								void removeTag(value).catch(handleTagSaveError);
							}}
							title={`Remove ${formatDatabaseTagLabel(value)}`}
						>
							<span>{formatDatabaseTagLabel(value)}</span>
							<X size={10} />
						</button>
					))}
					<input
						ref={focusTagInput}
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
									onClose();
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
								void addTag(tagDraft).catch(handleTagSaveError);
								return;
							}
							if (event.key === "Escape") {
								event.preventDefault();
								onClose();
								return;
							}
							if (event.key !== "Backspace" || tagDraft.length > 0) {
								return;
							}
							const lastTag =
								cellValue.value_list[cellValue.value_list.length - 1];
							if (!lastTag) return;
							event.preventDefault();
							void removeTag(lastTag).catch(handleTagSaveError);
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
									<span>{formatDatabaseTagLabel(tag)}</span>
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

	if (isListLike) {
		return (
			<div className="databaseTagEditor">
				<div
					ref={valueFieldRef}
					role="presentation"
					className="notePropertyTagField databaseTagField"
					onMouseDown={(event) => {
						handleSelectRow();
						if (event.target !== event.currentTarget) return;
						event.preventDefault();
						valueInputRef.current?.focus();
					}}
				>
					{cellValue.value_list.map((value, valueIndex) => (
						<button
							key={`${column.id}:${valueIndex}:${value}`}
							type="button"
							className="notePropertyToken"
							style={toneStyleForValue(value)}
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => {
								void removeListValue(value).catch(handleTagSaveError);
							}}
							title={`Remove ${value}`}
						>
							<span>{value}</span>
							<X size={10} />
						</button>
					))}
					<input
						ref={focusValueInput}
						type="text"
						className="notePropertyTagInput"
						value={valueDraft}
						placeholder={
							cellValue.value_list.length > 0 ? "" : "Add or choose a value"
						}
						onFocus={handleSelectRow}
						onChange={(event) => setValueDraft(event.target.value)}
						onBlur={(event) => {
							const relatedTarget = event.relatedTarget as Node | null;
							if (
								relatedTarget &&
								valueFieldRef.current?.contains(relatedTarget)
							) {
								return;
							}
							void (async () => {
								try {
									if (valueDraft.trim()) {
										await addListValue(valueDraft);
									}
								} catch (error) {
									setSaveError(extractErrorMessage(error));
								} finally {
									onClose();
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
								void addListValue(valueDraft).catch(handleTagSaveError);
								return;
							}
							if (event.key === "Escape") {
								event.preventDefault();
								onClose();
								return;
							}
							if (event.key !== "Backspace" || valueDraft.length > 0) {
								return;
							}
							const lastValue =
								cellValue.value_list[cellValue.value_list.length - 1];
							if (!lastValue) return;
							event.preventDefault();
							void removeListValue(lastValue).catch(handleTagSaveError);
						}}
					/>
				</div>
				{valueSuggestions.length > 0 ? (
					<div className="notePropertySuggestions databaseTagSuggestions">
						<div className="notePropertySuggestionsLabel">Suggested values</div>
						<div className="notePropertySuggestionList">
							{valueSuggestions.map((value) => (
								<button
									key={value}
									type="button"
									className="notePropertySuggestionChip"
									onMouseDown={(event) => {
										event.preventDefault();
										void addListValue(value).catch(handleTagSaveError);
									}}
								>
									<span>{value}</span>
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
		<div className="databaseTagEditor">
			<Input
				ref={focusTextInput}
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
				onBlur={() => void commitText()}
				onFocus={(event) => {
					handleSelectRow();
					event.currentTarget.select();
				}}
				onClick={(event) => {
					handleSelectRow();
					event.stopPropagation();
				}}
				onDoubleClick={(event) => event.stopPropagation()}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						void commitText();
					}
					if (event.key === "Escape") {
						event.preventDefault();
						onClose();
					}
				}}
			/>
			{textSuggestions.length > 0 ? (
				<div className="notePropertySuggestions databaseTagSuggestions">
					<div className="notePropertySuggestionsLabel">Suggested values</div>
					<div className="notePropertySuggestionList">
						{textSuggestions.map((value) => (
							<button
								key={value}
								type="button"
								className="notePropertySuggestionChip"
								onMouseDown={(event) => {
									event.preventDefault();
									setDraft(value);
								}}
							>
								<span>{value}</span>
							</button>
						))}
					</div>
				</div>
			) : null}
			{saveError ? <div className="databaseCellError">{saveError}</div> : null}
		</div>
	);
}

export function DatabaseCell({
	row,
	column,
	isRowSelected = false,
	laneColors = EMPTY_LANE_COLORS,
	onOpenNote,
	onSelectRow,
	valueOptions = [],
	onRenameTitle,
	onSave,
}: DatabaseCellProps) {
	const editable = isColumnEditable(column);
	const cellValue = useMemo(
		() => databaseCellValueFromRow(row, column),
		[column, row],
	);
	const [editing, setEditing] = useState(false);
	const displayText =
		cellValue.kind === "datetime"
			? formatDatabaseDateTime(cellValue.value_text)
			: (cellValue.value_text ?? "");
	const tagPillItems = useMemo<DatabaseDisplayPill[]>(() => {
		if (cellValue.kind !== "tags") return [];
		return cellValue.value_list.map((value) => ({
			key: `${column.id}:${value}`,
			label: formatDatabaseTagLabel(value),
			style: databaseValueToneStyleForColor(value, laneColors[value] ?? null),
			title: formatDatabaseTagLabel(value),
		}));
	}, [cellValue.kind, cellValue.value_list, column.id, laneColors]);
	const listPillItems = useMemo<DatabaseDisplayPill[]>(() => {
		if (
			cellValue.kind !== "list" &&
			cellValue.kind !== "relation" &&
			cellValue.kind !== "multi_select"
		) {
			return [];
		}
		return cellValue.value_list.map((value) => ({
			key: `${column.id}:${value}`,
			label: value,
			style: databaseValueToneStyleForColor(value, laneColors[value] ?? null),
			title: value,
		}));
	}, [cellValue.kind, cellValue.value_list, column.id, laneColors]);
	const editorKey = `${row.note_path}:${column.id}:${cellValue.kind}:${cellValue.value_text ?? ""}:${cellValue.value_bool ?? ""}:${cellValue.value_list.join("\u0001")}`;

	const handleSelectRow = () => {
		onSelectRow?.(row.note_path);
	};

	if (column.type === "property" && column.property_kind === "checkbox") {
		return (
			<div
				role="presentation"
				className="notePropertyToggle databaseCheckboxCell"
				onClick={(event) => {
					handleSelectRow();
					event.stopPropagation();
				}}
				onKeyDown={(event) => event.stopPropagation()}
			>
				<Toggle
					slim
					size="sm"
					ariaLabel={column.label}
					checked={Boolean(cellValue.value_bool)}
					onFocus={handleSelectRow}
					onCheckedChange={(checked) =>
						void onSave(row.note_path, column, {
							kind: "checkbox",
							value_bool: checked,
							value_list: [],
						})
					}
				/>
			</div>
		);
	}

	if (!editing || !editable) {
		if (cellValue.kind === "tags") {
			const fullValue = cellValue.value_list
				.map((value) => formatDatabaseTagLabel(value))
				.join(", ");
			return (
				<button
					type="button"
					className="databaseCellButton is-pill-list"
					onDoubleClick={() => setEditing(true)}
					onClick={(event) => {
						handleSelectRow();
						event.stopPropagation();
					}}
					title={fullValue || "Double-click to edit tags"}
				>
					<ResponsivePillList items={tagPillItems} />
				</button>
			);
		}
		if (
			cellValue.kind === "list" ||
			cellValue.kind === "relation" ||
			cellValue.kind === "multi_select"
		) {
			const fullValue = cellValue.value_list.join(", ");
			return (
				<button
					type="button"
					className="databaseCellButton is-pill-list"
					onDoubleClick={() => {
						if (editable) setEditing(true);
					}}
					onClick={(event) => {
						handleSelectRow();
						event.stopPropagation();
					}}
					title={fullValue || "Double-click to edit"}
				>
					<ResponsivePillList items={listPillItems} />
				</button>
			);
		}
		if (column.type === "property" && column.property_kind === "yaml") {
			if (!cellValue.value_text?.trim()) return null;
			return (
				<pre className="databaseCellYaml">{cellValue.value_text.trim()}</pre>
			);
		}
		if (column.type === "title") {
			return (
				<div className="databaseTitleCell">
					<button
						type="button"
						className="databaseCellButton databaseTitleCellMain is-title"
						onDoubleClick={() => {
							if (editable) setEditing(true);
						}}
						onClick={(event) => {
							handleSelectRow();
							event.stopPropagation();
						}}
						title="Double-click to rename note"
					>
						{displayText.trim() ? (
							<span className="databaseCellText">{displayText}</span>
						) : null}
					</button>
					{isRowSelected ? (
						<button
							type="button"
							className="databaseCellOpenButton"
							onClick={(event) => {
								handleSelectRow();
								event.stopPropagation();
								onOpenNote?.(row.note_path);
							}}
							title="Open note"
						>
							Open
						</button>
					) : null}
				</div>
			);
		}
		return (
			<button
				type="button"
				className={["databaseCellButton", !editable ? "is-readonly" : ""]
					.filter(Boolean)
					.join(" ")}
				onDoubleClick={() => {
					if (editable) setEditing(true);
				}}
				onClick={(event) => {
					handleSelectRow();
					event.stopPropagation();
				}}
				title={editable ? "Double-click to edit" : undefined}
			>
				{displayText.trim() ? (
					<span className="databaseCellText">{displayText}</span>
				) : null}
			</button>
		);
	}

	return (
		<DatabaseCellEditor
			key={editorKey}
			row={row}
			column={column}
			laneColors={laneColors}
			onOpenNote={onOpenNote}
			onSelectRow={onSelectRow}
			valueOptions={valueOptions}
			onRenameTitle={onRenameTitle}
			onSave={onSave}
			onClose={() => setEditing(false)}
		/>
	);
}
