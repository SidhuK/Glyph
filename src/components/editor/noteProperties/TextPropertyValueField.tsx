import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NoteProperty } from "../../../lib/tauri";
import { Edit } from "../../Icons";
import { Button } from "../../ui/shadcn/button";
import { Input } from "../../ui/shadcn/input";
import { useWikiLinkAutocomplete } from "../hooks/useWikiLinkAutocomplete";
import { findWikiLinkSpans } from "../markdown/wikiLinkCodec";
import { WikiLinkedText } from "./WikiLinkedText";

interface TextPropertyValueFieldProps {
	property: NoteProperty;
	onUpdate: (patch: Partial<NoteProperty>) => void;
}

export function TextPropertyValueField({
	property,
	onUpdate,
}: TextPropertyValueFieldProps) {
	const { t } = useTranslation("menu");
	const value = property.value_text ?? "";
	const [draft, setDraft] = useState(value);
	const [isEditing, setIsEditing] = useState(
		() => findWikiLinkSpans(value).length === 0,
	);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const wikiLinkAutocomplete = useWikiLinkAutocomplete({
		enabled: property.kind === "text" && isEditing,
		inputRef,
		value: draft,
		onChange: setDraft,
	});
	const hasWikiLinks = findWikiLinkSpans(draft).length > 0;

	const commitDraft = () => {
		if (draft !== value) onUpdate({ value_text: draft });
		setIsEditing(false);
	};

	if (!isEditing && hasWikiLinks) {
		return (
			<div className="notePropertyWikiLinkDisplay">
				<WikiLinkedText value={draft} />
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					className="notePropertyWikiLinkEdit"
					aria-label={t("submenus.edit")}
					title={t("submenus.edit")}
					onClick={() => setIsEditing(true)}
				>
					<Edit size="var(--icon-xs)" />
				</Button>
			</div>
		);
	}

	return (
		<div className="notePropertyTextEditor">
			<Input
				ref={inputRef}
				autoFocus={hasWikiLinks}
				className="plainTextInput notePropertyFieldInput"
				style={{ color: "var(--text-primary)" }}
				type={
					property.kind === "date"
						? "date"
						: property.kind === "url"
							? "url"
							: "text"
				}
				value={draft}
				placeholder={draft ? "" : "—"}
				aria-label={`${property.key || "Property"} value`}
				onChange={(event) => {
					const nextValue = event.target.value;
					setDraft(nextValue);
					wikiLinkAutocomplete.refresh(
						nextValue,
						event.currentTarget.selectionStart,
					);
				}}
				onBlur={commitDraft}
				onFocus={(event) => {
					wikiLinkAutocomplete.refresh(
						event.currentTarget.value,
						event.currentTarget.selectionStart,
					);
				}}
				onClick={(event) => {
					wikiLinkAutocomplete.refresh(
						event.currentTarget.value,
						event.currentTarget.selectionStart,
					);
				}}
				onKeyDown={(event) => {
					if (wikiLinkAutocomplete.handleKeyDown(event)) return;
					if (event.key === "Escape") {
						event.preventDefault();
						setDraft(value);
						setIsEditing(false);
						return;
					}
					if (event.key !== "Enter") return;
					event.preventDefault();
					event.currentTarget.blur();
				}}
			/>
			{wikiLinkAutocomplete.items.length > 0 ? (
				<div className="wikiLinkSuggestionMenu notePropertyWikiLinkSuggestions">
					{wikiLinkAutocomplete.items.map((item, itemIndex) => (
						<button
							key={
								item.kind === "heading"
									? `${item.kind}:${item.path}#${item.slug}`
									: `${item.kind}:${item.path}`
							}
							type="button"
							className={[
								"wikiLinkSuggestionItem",
								itemIndex === wikiLinkAutocomplete.activeIndex ? "active" : "",
							]
								.filter(Boolean)
								.join(" ")}
							onMouseDown={(event) => {
								event.preventDefault();
								wikiLinkAutocomplete.select(item);
							}}
						>
							<span className="wikiLinkSuggestionTitle">{item.title}</span>
							<span className="wikiLinkSuggestionPath">{item.path}</span>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}
