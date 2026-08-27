import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SettingsSearchEntry } from "../settings/settingsSearch";
import {
	type PaletteSettingDefinition,
	type PaletteSettingOption,
	paletteSettingOptionLabel,
} from "./settingsPaletteRegistry";

interface PaletteSettingEditorProps {
	entry: SettingsSearchEntry;
	definition: PaletteSettingDefinition;
	value: string | number | boolean | null;
	folders: readonly string[];
	pending: boolean;
	error: string | null;
	onBack: () => void;
	onChange: (value: string | number | boolean | null) => void;
}

function displayValue(value: string | number | boolean | null) {
	if (value === null) return "";
	return String(value);
}

export function PaletteSettingEditor({
	entry,
	definition,
	value,
	folders,
	pending,
	error,
	onBack,
	onChange,
}: PaletteSettingEditorProps) {
	const { t } = useTranslation("shell");
	const [draft, setDraft] = useState(() => displayValue(value));
	const [pathQuery, setPathQuery] = useState("");
	const inputRef = useRef<HTMLInputElement | null>(null);
	const backButtonRef = useRef<HTMLButtonElement | null>(null);
	const selectedOptionRef = useRef<HTMLButtonElement | null>(null);
	const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
	const pathOptions: readonly PaletteSettingOption[] = folders.map(
		(folder) => ({
			value: folder,
			label: folder || t("commandPalette.spaceRoot"),
		}),
	);
	const options =
		definition.control === "path" ? pathOptions : (definition.options ?? []);
	const visibleOptions =
		definition.control === "path" && pathQuery.trim()
			? options.filter((option) =>
					paletteSettingOptionLabel(option)
						.toLowerCase()
						.includes(pathQuery.trim().toLowerCase()),
				)
			: options;
	useEffect(() => {
		(
			inputRef.current ??
			selectedOptionRef.current ??
			optionRefs.current[0] ??
			backButtonRef.current
		)?.focus();
	}, []);

	const handleKeyDown = (event: React.KeyboardEvent) => {
		const target = event.target;
		const emptyChildInput =
			target instanceof HTMLInputElement ? !target.value : !draft;
		const cursorAtStart =
			target instanceof HTMLInputElement
				? target.selectionStart === 0 && target.selectionEnd === 0
				: true;
		if (
			(event.key === "ArrowDown" || event.key === "ArrowUp") &&
			(definition.control === "choice" || definition.control === "path")
		) {
			event.preventDefault();
			const options = optionRefs.current.filter(
				(option): option is HTMLButtonElement => option !== null,
			);
			if (!options.length) return;
			const currentIndex = options.findIndex((option) => option === target);
			const direction = event.key === "ArrowDown" ? 1 : -1;
			const startIndex =
				currentIndex >= 0 ? currentIndex : direction === 1 ? -1 : 0;
			const nextIndex =
				(startIndex + direction + options.length) % options.length;
			options[nextIndex]?.focus();
			return;
		}
		if (
			event.key === "Escape" ||
			(event.key === "ArrowLeft" && cursorAtStart) ||
			(event.key === "Backspace" && emptyChildInput)
		) {
			event.preventDefault();
			event.stopPropagation();
			onBack();
		}
	};

	return (
		<div className="commandPaletteSettingEditor" onKeyDown={handleKeyDown}>
			<button
				ref={backButtonRef}
				type="button"
				className="commandPaletteBreadcrumb"
				onClick={onBack}
			>
				<span className="commandPaletteBackIcon" aria-hidden="true">
					←
				</span>
				<span>
					{t("commandPalette.settingsBreadcrumb", {
						section: entry.section ?? entry.title,
						title: entry.title,
					})}
				</span>
			</button>

			{entry.description ? (
				<p className="commandPaletteSettingDescription">{entry.description}</p>
			) : null}
			{error ? (
				<div className="commandPaletteSettingError" role="alert">
					{error}
				</div>
			) : null}

			{definition.control === "choice" || definition.control === "path" ? (
				<div className="commandPaletteSettingOptions">
					{definition.control === "path" ? (
						<input
							ref={inputRef}
							className="commandPaletteSettingInput commandPalettePathSearch"
							value={pathQuery}
							onChange={(event) => setPathQuery(event.target.value)}
							placeholder={t("commandPalette.searchFolders")}
						/>
					) : null}
					{definition.control === "path" ? (
						<button
							ref={(node) => {
								optionRefs.current[0] = node;
							}}
							type="button"
							className="commandPaletteItem commandPaletteSettingOption"
							aria-pressed={value === null || value === ""}
							data-selected={value === null || value === ""}
							disabled={pending}
							onClick={() => onChange(null)}
						>
							<span>{t("commandPalette.clearValue")}</span>
							{value === null || value === "" ? (
								<span aria-hidden="true">✓</span>
							) : null}
						</button>
					) : null}
					{visibleOptions.map((option, index) => {
						const selected = option.value === value;
						const optionIndex =
							definition.control === "path" ? index + 1 : index;
						return (
							<button
								ref={(node) => {
									optionRefs.current[optionIndex] = node;
									if (selected) selectedOptionRef.current = node;
								}}
								key={String(option.value)}
								type="button"
								aria-pressed={selected}
								className="commandPaletteItem commandPaletteSettingOption"
								data-selected={selected}
								disabled={pending}
								onClick={() => onChange(option.value)}
							>
								<span>{paletteSettingOptionLabel(option)}</span>
								{selected ? <span aria-hidden="true">✓</span> : null}
							</button>
						);
					})}
				</div>
			) : null}

			{definition.control === "number" || definition.control === "text" ? (
				<form
					className="commandPaletteSettingForm"
					onSubmit={(event) => {
						event.preventDefault();
						const nextValue =
							definition.control === "number" ? Number(draft) : draft;
						onChange(nextValue);
					}}
				>
					<input
						ref={inputRef}
						type={definition.control === "number" ? "number" : "text"}
						className="commandPaletteSettingInput"
						value={draft}
						min={definition.min}
						max={definition.max}
						onChange={(event) => setDraft(event.target.value)}
					/>
					<button
						type="submit"
						className="commandPaletteSettingSave"
						disabled={pending || !draft.trim()}
					>
						{pending ? t("commandPalette.saving") : t("commandPalette.save")}
					</button>
				</form>
			) : null}

			{definition.control === "action" ? (
				<div className="commandPaletteSettingStatus">
					<strong>{entry.title}</strong>
					<button
						type="button"
						className="commandPaletteSettingSave"
						disabled={pending}
						onClick={() => onChange(true)}
					>
						{pending
							? t("commandPalette.running")
							: t("commandPalette.runAction")}
					</button>
				</div>
			) : null}
		</div>
	);
}
