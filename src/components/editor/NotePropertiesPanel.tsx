import * as Icons from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NoteProperty, TagCount } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { ChevronDown, Plus, X } from "../Icons";
import { Button } from "../ui/shadcn/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";
import { Input } from "../ui/shadcn/input";

interface NotePropertiesPanelProps {
	frontmatter: string | null;
	readOnly?: boolean;
	onChange: (frontmatter: string | null) => void;
	onErrorChange?: (message: string) => void;
}

const PROPERTY_KINDS = [
	"text",
	"url",
	"number",
	"date",
	"checkbox",
	"list",
	"tags",
	"yaml",
] as const;

type PropertyKind = (typeof PROPERTY_KINDS)[number];

const PROPERTY_KIND_ICONS: Record<
	PropertyKind,
	(typeof Icons)[keyof typeof Icons]
> = {
	text: Icons.InputTextIcon,
	url: Icons.AnalysisTextLinkIcon,
	number: Icons.HashtagIcon,
	date: Icons.Calendar03Icon,
	checkbox: Icons.CheckmarkCircle02Icon,
	list: Icons.LeftToRightListBulletIcon,
	tags: Icons.Tag01Icon,
	yaml: Icons.SourceCodeIcon,
};

const PROPERTY_KIND_LABELS: Record<PropertyKind, string> = {
	text: "Text",
	url: "URL",
	number: "Number",
	date: "Date",
	checkbox: "Checkbox",
	list: "List",
	tags: "Tags",
	yaml: "YAML",
};

function emptyProperty(): NoteProperty {
	return {
		key: "",
		kind: "text",
		value_text: "",
		value_bool: null,
		value_list: [],
	};
}

function listText(property: NoteProperty): string {
	return property.value_list.join(", ");
}

function fromListText(value: string): string[] {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

function normalizeTagToken(value: string): string | null {
	const normalized = value
		.trim()
		.replace(/^#+/, "")
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9_/-]/g, "");
	return normalized || null;
}

function formatTagLabel(tag: string): string {
	return tag.startsWith("#") ? tag : `#${tag}`;
}

function displayValue(property: NoteProperty): string {
	if (property.kind === "checkbox")
		return property.value_bool ? "True" : "False";
	if (property.kind === "tags" || property.kind === "list") {
		return property.value_list.join(", ");
	}
	return property.value_text ?? "";
}

function normalizeForKind(property: NoteProperty): NoteProperty {
	switch (property.kind) {
		case "checkbox":
			return {
				...property,
				value_bool:
					property.value_bool ??
					(property.value_text ?? "").trim().toLowerCase() === "true",
			};
		case "tags":
		case "list":
			return {
				...property,
				value_list:
					property.value_list.length > 0
						? property.value_list
						: fromListText(property.value_text ?? ""),
			};
		case "yaml":
			return {
				...property,
				value_text:
					property.value_text ??
					(property.value_list.length > 0
						? property.value_list.join(", ")
						: property.value_bool != null
							? String(property.value_bool)
							: ""),
			};
		default:
			return {
				...property,
				value_text:
					property.value_text ??
					(property.value_list.length > 0
						? property.value_list.join(", ")
						: property.value_bool != null
							? String(property.value_bool)
							: ""),
			};
	}
}

function PropertyKindBadge({
	kind,
	interactive = false,
	onSelect,
}: {
	kind: string;
	interactive?: boolean;
	onSelect?: (kind: PropertyKind) => void;
}) {
	const resolvedKind = PROPERTY_KINDS.includes(kind as PropertyKind)
		? (kind as PropertyKind)
		: "text";
	const icon = PROPERTY_KIND_ICONS[resolvedKind];
	const label = PROPERTY_KIND_LABELS[resolvedKind];

	if (interactive) {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						size="xs"
						variant="ghost"
						className="notePropertyKindBadge notePropertyKindTrigger"
						title={`Property type: ${label}`}
					>
						<HugeiconsIcon icon={icon} size={14} />
						<span>{label}</span>
						<ChevronDown size={12} />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					sideOffset={6}
					className="notePropertyKindMenu"
				>
					<DropdownMenuRadioGroup
						value={resolvedKind}
						onValueChange={(value) => onSelect?.(value as PropertyKind)}
					>
						{PROPERTY_KINDS.map((menuKind) => (
							<DropdownMenuRadioItem
								key={menuKind}
								value={menuKind}
								className="notePropertyKindOption"
							>
								<span className="notePropertyKindOptionIcon">
									<HugeiconsIcon
										icon={PROPERTY_KIND_ICONS[menuKind]}
										size={14}
									/>
								</span>
								<span className="notePropertyKindOptionLabel">
									{PROPERTY_KIND_LABELS[menuKind]}
								</span>
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	return (
		<div className="notePropertyKindBadge">
			<HugeiconsIcon icon={icon} size={14} />
			<span>{label}</span>
		</div>
	);
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
	const lastCommittedFrontmatterRef = useRef<string | null>(
		frontmatter ?? null,
	);
	const propertyRowIdCounterRef = useRef(0);
	const tagInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

	useEffect(() => {
		if ((frontmatter ?? null) === lastCommittedFrontmatterRef.current) {
			setRawDraft(frontmatter ?? "");
			return;
		}
		setRawDraft(frontmatter ?? "");
		void invoke("note_frontmatter_parse_properties", { frontmatter })
			.then((parsed) => {
				setProperties(parsed);
				setPropertyRowIds(
					parsed.map(() => `property-row-${propertyRowIdCounterRef.current++}`),
				);
				lastCommittedFrontmatterRef.current = frontmatter ?? null;
				onErrorChange?.("");
			})
			.catch((error) => {
				onErrorChange?.(error instanceof Error ? error.message : String(error));
				setMode("raw");
			});
	}, [frontmatter, onErrorChange]);

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
		setProperties(nextProperties);
		setPropertyRowIds(nextRowIds);
		void invoke("note_frontmatter_render_properties", {
			properties: nextProperties,
		})
			.then((nextFrontmatter) => {
				setRawDraft(nextFrontmatter ?? "");
				lastCommittedFrontmatterRef.current = nextFrontmatter ?? null;
				onErrorChange?.("");
				onChange(nextFrontmatter);
			})
			.catch((error) => {
				onErrorChange?.(error instanceof Error ? error.message : String(error));
			});
	};

	const updateProperty = (index: number, patch: Partial<NoteProperty>) => {
		const next = properties.map((property, currentIndex) =>
			currentIndex === index
				? normalizeForKind({ ...property, ...patch })
				: property,
		);
		commitProperties(next);
	};

	const setTagDraft = (index: number, value: string) => {
		setTagDrafts((current) => ({ ...current, [index]: value }));
	};

	const addTag = (index: number, rawValue: string) => {
		const nextTag = normalizeTagToken(rawValue);
		if (!nextTag) return;
		const currentTags = properties[index]?.value_list ?? [];
		if (currentTags.includes(nextTag)) {
			setTagDraft(index, "");
			return;
		}
		updateProperty(index, { value_list: [...currentTags, nextTag] });
		setTagDraft(index, "");
	};

	const removeTag = (index: number, tag: string) => {
		updateProperty(index, {
			value_list: (properties[index]?.value_list ?? []).filter(
				(currentTag) => currentTag !== tag,
			),
		});
	};

	return (
		<div className="notePropertiesPanel">
			<div className="notePropertiesToolbar">
				<div className="notePropertiesToolbarLabel">Properties</div>
				<div className="notePropertiesToolbarActions">
					<Button
						type="button"
						size="xs"
						variant={mode === "properties" ? "outline" : "ghost"}
						onClick={() => setMode("properties")}
						disabled={!canShowProperties}
					>
						Properties
					</Button>
					<Button
						type="button"
						size="xs"
						variant={mode === "raw" ? "outline" : "ghost"}
						onClick={() => setMode("raw")}
					>
						Raw
					</Button>
				</div>
			</div>

			{mode === "raw" ? (
				<textarea
					className="frontmatterEditor"
					value={rawDraft}
					rows={Math.max(6, rawDraft.split("\n").length + 1)}
					onChange={(event) => {
						const next = event.target.value;
						setRawDraft(next);
						onChange(next.trim().length ? next : null);
					}}
					placeholder="---\ntitle: Untitled\n---"
					spellCheck={false}
					readOnly={readOnly}
				/>
			) : (
				<div className="notePropertiesList">
					{properties.map((property, index) => (
						<div
							key={propertyRowIds[index] ?? `property-row-fallback-${index}`}
							className="notePropertyRow"
						>
							{readOnly ? (
								<>
									<div className="notePropertyIdentity">
										<PropertyKindBadge kind={property.kind} />
										<div className="notePropertyKeyStatic">{property.key}</div>
									</div>
									<div className="notePropertyValueStatic">
										{property.kind === "tags" || property.kind === "list" ? (
											<div className="notePropertyPills">
												{property.value_list.map((value) => (
													<span key={value} className="notePropertyPill">
														{property.kind === "tags"
															? formatTagLabel(value)
															: value}
													</span>
												))}
											</div>
										) : (
											displayValue(property)
										)}
									</div>
								</>
							) : (
								<>
									<div className="notePropertyIdentity">
										<PropertyKindBadge
											kind={property.kind}
											interactive
											onSelect={(kind) =>
												updateProperty(index, {
													kind,
												})
											}
										/>
										<Input
											value={property.key}
											className="notePropertyKeyInput"
											placeholder="Property"
											onChange={(event) =>
												updateProperty(index, {
													key: event.target.value,
												})
											}
										/>
									</div>
									<div className="notePropertyValue">
										{property.kind === "checkbox" ? (
											<label className="settingsToggle notePropertyToggle">
												<input
													type="checkbox"
													checked={Boolean(property.value_bool)}
													onChange={(event) =>
														updateProperty(index, {
															value_bool: event.target.checked,
														})
													}
												/>
												<span aria-hidden />
											</label>
										) : property.kind === "tags" ? (
											<>
												<div
													className="notePropertyTagField"
													onMouseDown={(event) => {
														if (event.target !== event.currentTarget) return;
														event.preventDefault();
														tagInputRefs.current[index]?.focus();
													}}
												>
													{property.value_list.map((value) => (
														<button
															key={value}
															type="button"
															className="notePropertyToken"
															onClick={() => removeTag(index, value)}
															title={`Remove ${formatTagLabel(value)}`}
														>
															<span>{formatTagLabel(value)}</span>
															<X size={10} />
														</button>
													))}
													<input
														ref={(node) => {
															tagInputRefs.current[index] = node;
														}}
														type="text"
														className="notePropertyTagInput"
														value={tagDrafts[index] ?? ""}
														placeholder={
															property.value_list.length > 0 ? "" : "Add a tag"
														}
														onChange={(event) =>
															setTagDraft(index, event.target.value)
														}
														onBlur={() => addTag(index, tagDrafts[index] ?? "")}
														onKeyDown={(event) => {
															if (event.key === "Enter" || event.key === ",") {
																event.preventDefault();
																addTag(index, tagDrafts[index] ?? "");
																return;
															}
															if (
																event.key === "Backspace" &&
																!(tagDrafts[index] ?? "").length
															) {
																const currentTags =
																	properties[index]?.value_list ?? [];
																const lastTag =
																	currentTags[currentTags.length - 1];
																if (lastTag) {
																	event.preventDefault();
																	removeTag(index, lastTag);
																}
															}
														}}
													/>
												</div>
												{(() => {
													const draft = normalizeTagToken(
														tagDrafts[index] ?? "",
													);
													if (!draft || draft.length < 2) return null;
													const selectedTags = new Set(property.value_list);
													const suggestions = availableTags
														.filter(
															({ tag }) =>
																!selectedTags.has(tag) && tag.includes(draft),
														)
														.slice(0, 8);
													if (!suggestions.length) return null;
													return (
														<div className="notePropertySuggestions">
															<div className="notePropertySuggestionsLabel">
																Suggested tags
															</div>
															<div className="notePropertySuggestionList">
																{suggestions.map(({ tag, count }) => (
																	<button
																		key={tag}
																		type="button"
																		className="notePropertySuggestionChip"
																		onMouseDown={(event) => {
																			event.preventDefault();
																			addTag(index, tag);
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
													);
												})()}
											</>
										) : property.kind === "list" ? (
											<>
												<Input
													className="notePropertyFieldInput"
													value={listText(property)}
													placeholder="item1, item2"
													onChange={(event) =>
														updateProperty(index, {
															value_list: fromListText(event.target.value),
														})
													}
												/>
												<div className="notePropertyPills">
													{property.value_list.map((value) => (
														<span key={value} className="notePropertyPill">
															{value}
														</span>
													))}
												</div>
											</>
										) : property.kind === "yaml" ? (
											<textarea
												className="notePropertyYamlInput"
												value={property.value_text ?? ""}
												onChange={(event) =>
													updateProperty(index, {
														value_text: event.target.value,
													})
												}
											/>
										) : (
											<Input
												className="notePropertyFieldInput"
												type={
													property.kind === "number"
														? "number"
														: property.kind === "date"
															? "date"
															: property.kind === "url"
																? "url"
																: "text"
												}
												value={property.value_text ?? ""}
												placeholder="Value"
												onChange={(event) =>
													updateProperty(index, {
														value_text: event.target.value,
													})
												}
											/>
										)}
									</div>
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										className="notePropertyRemoveButton"
										onClick={() =>
											commitProperties(
												properties.filter(
													(_, currentIndex) => currentIndex !== index,
												),
												propertyRowIds.filter(
													(_, currentIndex) => currentIndex !== index,
												),
											)
										}
										aria-label={`Remove ${property.key || "property"}`}
									>
										<X size={14} />
									</Button>
								</>
							)}
						</div>
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
