import { useEffect, useMemo, useRef, useState } from "react";
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

interface NotePropertiesPanelProps {
	frontmatter: string | null;
	readOnly?: boolean;
	onChange: (frontmatter: string | null) => void;
	onErrorChange?: (message: string) => void;
}

export function NotePropertiesPanel({
	frontmatter,
	readOnly = false,
	onChange,
	onErrorChange,
}: NotePropertiesPanelProps) {
	const [mode, setMode] = useState<"properties" | "raw">("properties");
	const [properties, setProperties] = useState<NoteProperty[]>([]);
	const [propertyRowIds, setPropertyRowIds] = useState<string[]>([]);
	const [rawDraft, setRawDraft] = useState(frontmatter ?? "");
	const [availableTags, setAvailableTags] = useState<TagCount[]>([]);
	const [tagDrafts, setTagDrafts] = useState<Record<number, string>>({});
	const lastCommittedFrontmatterRef = useRef<string | null>(null);
	const propertyRowIdCounterRef = useRef(0);
	const tagInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
	const parseRequestIdRef = useRef(0);
	const renderRequestIdRef = useRef(0);

	useEffect(() => {
		if (mode === "raw") {
			setRawDraft(frontmatter ?? "");
			return;
		}
		if ((frontmatter ?? null) === lastCommittedFrontmatterRef.current) {
			setRawDraft(frontmatter ?? "");
			return;
		}
		const requestId = ++parseRequestIdRef.current;
		setRawDraft(frontmatter ?? "");
		void invoke("note_frontmatter_parse_properties", { frontmatter })
			.then((parsed) => {
				if (requestId !== parseRequestIdRef.current) return;
				setProperties(parsed);
				setPropertyRowIds(
					parsed.map(() => `property-row-${propertyRowIdCounterRef.current++}`),
				);
				lastCommittedFrontmatterRef.current = frontmatter ?? null;
				onErrorChange?.("");
			})
			.catch((error) => {
				if (requestId !== parseRequestIdRef.current) return;
				onErrorChange?.(error instanceof Error ? error.message : String(error));
				setMode("raw");
			});
	}, [frontmatter, mode, onErrorChange]);

	useEffect(() => {
		if (readOnly) return;
		void invoke("tags_list", { limit: 40 })
			.then((tags) => setAvailableTags(tags))
			.catch(() => setAvailableTags([]));
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
		setProperties(nextProperties);
		setPropertyRowIds(nextRowIds);
		void invoke("note_frontmatter_render_properties", {
			properties: nextProperties,
		})
			.then((nextFrontmatter) => {
				if (requestId !== renderRequestIdRef.current) return;
				setRawDraft(nextFrontmatter ?? "");
				lastCommittedFrontmatterRef.current = nextFrontmatter ?? null;
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
				onModeChange={setMode}
			/>
			{mode === "raw" ? (
				<RawFrontmatterEditor
					value={rawDraft}
					readOnly={readOnly}
					onChange={(nextValue, nextRawDraft) => {
						setRawDraft(nextRawDraft);
						onChange(nextValue);
					}}
				/>
			) : (
				<div className="notePropertiesList">
					{properties.map((property, index) => (
						<NotePropertyRow
							key={propertyRowIds[index] ?? `property-row-fallback-${index}`}
							rowId={propertyRowIds[index] ?? `property-row-fallback-${index}`}
							index={index}
							property={property}
							readOnly={readOnly}
							availableTags={availableTags}
							tagDraft={tagDrafts[index] ?? ""}
							onSetTagDraft={(propertyIndex, value) =>
								setTagDrafts((current) => ({
									...current,
									[propertyIndex]: value,
								}))
							}
							onAddTag={(propertyIndex, rawValue) => {
								const nextTag = normalizeTagToken(rawValue);
								if (!nextTag) return;
								const currentTags = properties[propertyIndex]?.value_list ?? [];
								if (currentTags.includes(nextTag)) {
									setTagDrafts((current) => ({
										...current,
										[propertyIndex]: "",
									}));
									return;
								}
								updateProperty(propertyIndex, {
									value_list: [...currentTags, nextTag],
								});
								setTagDrafts((current) => ({
									...current,
									[propertyIndex]: "",
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
							onRemove={(propertyIndex) =>
								commitProperties(
									properties.filter(
										(_, currentIndex) => currentIndex !== propertyIndex,
									),
									propertyRowIds.filter(
										(_, currentIndex) => currentIndex !== propertyIndex,
									),
								)
							}
							onSetTagInputRef={(propertyIndex, node) => {
								tagInputRefs.current[propertyIndex] = node;
							}}
							tagInputRef={tagInputRefs.current[index] ?? null}
						/>
					))}
					{!readOnly ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
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
							<Plus size={14} />
							Add property
						</Button>
					) : null}
				</div>
			)}
		</div>
	);
}
