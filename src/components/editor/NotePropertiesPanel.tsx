import { useEffect, useMemo, useRef, useState } from "react";
import { useStatusPropertyColors } from "../../hooks/useStatusPropertyColors";
import type { NoteProperty, TagCount } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { Plus } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { NotePropertiesToolbar } from "./noteProperties/NotePropertiesToolbar";
import { NotePropertyRow } from "./noteProperties/NotePropertyRow";
import { RawFrontmatterEditor } from "./noteProperties/RawFrontmatterEditor";
import {
	emptyProperty,
	normalizeForKind,
	normalizeTagToken,
} from "./noteProperties/utils";

function normalizeFrontmatter(fm: string | null): string | null {
	if (fm == null) return null;
	const trimmed = fm.trim();
	return trimmed.length ? trimmed : null;
}

interface NotePropertiesPanelProps {
	frontmatter: string | null;
	readOnly?: boolean;
	onChange: (frontmatter: string | null) => void;
	onErrorChange?: (message: string) => void;
}

interface NotePropertiesEditorState {
	properties: NoteProperty[];
	propertyRowIds: string[];
	rawDraft: string;
}

export function NotePropertiesPanel({
	frontmatter,
	readOnly = false,
	onChange,
	onErrorChange,
}: NotePropertiesPanelProps) {
	const [mode, updateMode] = useState<"properties" | "raw">("properties");
	const [editorState, updateEditorState] = useState<NotePropertiesEditorState>({
		properties: [],
		propertyRowIds: [],
		rawDraft: frontmatter ?? "",
	});
	const [availableTags, updateAvailableTags] = useState<TagCount[]>([]);
	const [tagDrafts, updateTagDrafts] = useState<Record<string, string>>({});
	const { colors: statusColors, setStatusColor } = useStatusPropertyColors();
	const lastCommittedFrontmatterRef = useRef<string | null>(null);
	const propertyRowIdCounterRef = useRef(0);
	const tagInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
	const parseRequestIdRef = useRef(0);
	const renderRequestIdRef = useRef(0);
	const { properties, propertyRowIds, rawDraft } = editorState;

	const pruneRowScopedState = (nextRowIds: string[]) => {
		updateTagDrafts((current) =>
			Object.fromEntries(
				nextRowIds.flatMap((rowId) =>
					rowId in current ? [[rowId, current[rowId] ?? ""]] : [],
				),
			),
		);
		tagInputRefs.current = Object.fromEntries(
			nextRowIds.flatMap((rowId) =>
				rowId in tagInputRefs.current
					? [[rowId, tagInputRefs.current[rowId] ?? null]]
					: [],
			),
		);
	};

	useEffect(() => {
		const nextRawDraft = frontmatter ?? "";
		if (mode === "raw") {
			parseRequestIdRef.current += 1;
			updateEditorState((current) =>
				current.rawDraft === nextRawDraft
					? current
					: { ...current, rawDraft: nextRawDraft },
			);
			return;
		}
		if (
			normalizeFrontmatter(frontmatter) ===
			normalizeFrontmatter(lastCommittedFrontmatterRef.current)
		) {
			parseRequestIdRef.current += 1;
			updateEditorState((current) =>
				current.rawDraft === nextRawDraft
					? current
					: { ...current, rawDraft: nextRawDraft },
			);
			return;
		}
		const requestId = ++parseRequestIdRef.current;
		updateEditorState((current) =>
			current.rawDraft === nextRawDraft
				? current
				: { ...current, rawDraft: nextRawDraft },
		);
		void invoke("note_frontmatter_parse_properties", { frontmatter })
			.then((parsed) => {
				if (requestId !== parseRequestIdRef.current) return;
				const nextRowIds = parsed.map(
					() => `property-row-${propertyRowIdCounterRef.current++}`,
				);
				updateEditorState({
					properties: parsed,
					propertyRowIds: nextRowIds,
					rawDraft: nextRawDraft,
				});
				updateTagDrafts({});
				tagInputRefs.current = {};
				lastCommittedFrontmatterRef.current = normalizeFrontmatter(frontmatter);
				onErrorChange?.("");
			})
			.catch((error) => {
				if (requestId !== parseRequestIdRef.current) return;
				onErrorChange?.(error instanceof Error ? error.message : String(error));
				updateMode("raw");
			});
	}, [frontmatter, mode, onErrorChange]);

	useEffect(() => {
		if (readOnly) return;
		void invoke("tags_list", { limit: 40 })
			.then((tags) => updateAvailableTags(tags))
			.catch(() => updateAvailableTags([]));
	}, [readOnly]);

	const canShowProperties = useMemo(
		() => properties.length > 0 || !rawDraft.trim(),
		[properties.length, rawDraft],
	);

	const commitProperties = (
		nextProperties: NoteProperty[],
		nextRowIds: string[] = propertyRowIds,
	) => {
		const requestId = ++renderRequestIdRef.current;
		updateEditorState((current) => ({
			...current,
			properties: nextProperties,
			propertyRowIds: nextRowIds,
		}));
		pruneRowScopedState(nextRowIds);
		void invoke("note_frontmatter_render_properties", {
			properties: nextProperties,
		})
			.then((nextFrontmatter) => {
				if (requestId !== renderRequestIdRef.current) return;
				updateEditorState((current) => ({
					...current,
					rawDraft: nextFrontmatter ?? "",
				}));
				lastCommittedFrontmatterRef.current =
					normalizeFrontmatter(nextFrontmatter);
				onErrorChange?.("");
				onChange(nextFrontmatter);
			})
			.catch((error) => {
				if (requestId !== renderRequestIdRef.current) return;
				onErrorChange?.(error instanceof Error ? error.message : String(error));
			});
	};

	const updateProperty = (index: number, patch: Partial<NoteProperty>) => {
		commitProperties(
			properties.map((property, currentIndex) =>
				currentIndex === index
					? normalizeForKind({ ...property, ...patch })
					: property,
			),
		);
	};

	return (
		<div className="notePropertiesPanel">
			<NotePropertiesToolbar
				mode={mode}
				canShowProperties={canShowProperties}
				onModeChange={updateMode}
			/>
			{mode === "raw" ? (
				<RawFrontmatterEditor
					value={rawDraft}
					readOnly={readOnly}
					onChange={(nextValue, nextRawDraft) => {
						updateEditorState((current) => ({
							...current,
							rawDraft: nextRawDraft,
						}));
						onChange(nextValue);
					}}
				/>
			) : (
				<div className="notePropertiesList">
					{properties.map((property, index) => {
						const rowId =
							propertyRowIds[index] ?? `property-row-fallback-${index}`;
						return (
							<NotePropertyRow
								key={rowId}
								rowId={rowId}
								index={index}
								property={property}
								readOnly={readOnly}
								availableTags={availableTags}
								tagDraft={tagDrafts[rowId] ?? ""}
								statusColors={statusColors}
								onSetTagDraft={(nextRowId, value) =>
									updateTagDrafts((current) => ({
										...current,
										[nextRowId]: value,
									}))
								}
								onAddTag={(nextRowId, propertyIndex, rawValue) => {
									const nextTag = normalizeTagToken(rawValue);
									if (!nextTag) return;
									const currentTags =
										properties[propertyIndex]?.value_list ?? [];
									if (currentTags.includes(nextTag)) {
										updateTagDrafts((current) => ({
											...current,
											[nextRowId]: "",
										}));
										return;
									}
									updateProperty(propertyIndex, {
										value_list: [...currentTags, nextTag],
									});
									updateTagDrafts((current) => ({
										...current,
										[nextRowId]: "",
									}));
								}}
								onRemoveTag={(propertyIndex, tag) =>
									updateProperty(propertyIndex, {
										value_list: (
											properties[propertyIndex]?.value_list ?? []
										).filter((currentTag) => currentTag !== tag),
									})
								}
								onUpdate={updateProperty}
								onStatusColorChange={setStatusColor}
								onRemove={(propertyIndex) => {
									const removedRowId = propertyRowIds[propertyIndex];
									if (removedRowId) {
										updateTagDrafts((current) => {
											const next = { ...current };
											delete next[removedRowId];
											return next;
										});
										delete tagInputRefs.current[removedRowId];
									}
									commitProperties(
										properties.filter(
											(_, currentIndex) => currentIndex !== propertyIndex,
										),
										propertyRowIds.filter(
											(_, currentIndex) => currentIndex !== propertyIndex,
										),
									);
								}}
								onSetTagInputRef={(nextRowId, node) => {
									tagInputRefs.current[nextRowId] = node;
								}}
								tagInputRef={tagInputRefs.current[rowId] ?? null}
							/>
						);
					})}
					{!readOnly ? (
						<div className="notePropertyAddWrap">
							<Button
								type="button"
								variant="ghost"
								size="xs"
								className="notePropertyAddButton"
								onClick={() =>
									commitProperties(
										[...properties, emptyProperty()],
										[
											...propertyRowIds,
											`property-row-${propertyRowIdCounterRef.current++}`,
										],
									)
								}
							>
								<Plus size={12} />
								Add property
							</Button>
						</div>
					) : null}
				</div>
			)}
		</div>
	);
}
