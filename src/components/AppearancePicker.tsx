import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { isAppearanceEmoji } from "../lib/appearanceEmoji";
import { rememberRecentIconId } from "../lib/appearancePickerRecents";
import {
	DATABASE_COLUMN_ICON_OPTIONS,
	type DatabaseColumnIconOption,
	getDatabaseColumnIconOption,
} from "../lib/database/columnIcons";
import { Search } from "./Icons";
import { AppearancePickerColors } from "./appearancePicker/AppearancePickerColors";
import { AppearancePickerGrid } from "./appearancePicker/AppearancePickerGrid";
import { AppearancePickerModes } from "./appearancePicker/AppearancePickerModes";
import { AppearancePickerSummary } from "./appearancePicker/AppearancePickerSummary";
import {
	type AppearancePickerMode,
	type AppearancePickerOption,
	useAppearancePickerGroups,
} from "./appearancePicker/useAppearancePickerGroups";
import { useIconGridNavigation } from "./appearancePicker/useIconGridNavigation";
import { DatabaseColumnIcon } from "./database/DatabaseColumnIcon";
import {
	EDITOR_TEXT_COLORS,
	type EditorTextColor,
	type EditorTextColorOption,
} from "./editor/textColors";
import { Button } from "./ui/shadcn/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/shadcn/dialog";
import { Input } from "./ui/shadcn/input";

interface AppearancePickerProps {
	title: string;
	previewLabel?: string;
	trigger?: (openPicker: () => void) => ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	iconValue?: string | null;
	defaultIconName?: string;
	iconOptions?: readonly DatabaseColumnIconOption[];
	/** Emoji selections call `onIconChange` with the emoji and a `null` option. */
	onIconChange: (iconName: string | null, option: DatabaseColumnIconOption | null) => void;
	showDefaultIcon?: boolean;
	allowEmoji?: boolean;
	colorValue?: EditorTextColor | null;
	colorOptions?: readonly EditorTextColorOption[];
	onColorChange?: (color: EditorTextColor | null) => void;
	showColors?: boolean;
	/** Clears icon and color in one write; color pickers must pass it so Reset can't race. */
	onReset?: () => void;
}

export function AppearancePicker({
	title,
	previewLabel,
	trigger,
	open,
	onOpenChange,
	iconValue,
	defaultIconName = "tag",
	iconOptions = DATABASE_COLUMN_ICON_OPTIONS,
	onIconChange,
	showDefaultIcon = false,
	allowEmoji = false,
	colorValue = null,
	colorOptions = EDITOR_TEXT_COLORS,
	onColorChange,
	showColors = false,
	onReset,
}: AppearancePickerProps) {
	const { t } = useTranslation("shell");
	const [internalOpen, setInternalOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [modeChoice, setModeChoice] = useState<AppearancePickerMode | null>(null);
	const [hoveredOption, setHoveredOption] = useState<AppearancePickerOption | null>(null);
	const [hoveredColor, setHoveredColor] = useState<EditorTextColor | null | undefined>(undefined);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const navigation = useIconGridNavigation(() => inputRef.current?.focus());
	const resolvedOpen = open ?? internalOpen;
	const normalizedQuery = query.trim().toLowerCase();
	const valueIsEmoji = isAppearanceEmoji(iconValue);
	const mode: AppearancePickerMode = allowEmoji
		? (modeChoice ?? (valueIsEmoji ? "emoji" : "icons"))
		: "icons";
	const picker = useAppearancePickerGroups({
		mode,
		open: resolvedOpen,
		query: normalizedQuery,
		iconOptions,
	});
	const selectedIconName =
		iconValue && (valueIsEmoji || getDatabaseColumnIconOption(iconValue)) ? iconValue : null;
	const previewIconName = hoveredOption?.id ?? selectedIconName ?? defaultIconName;
	const previewColorId = hoveredColor === undefined ? colorValue : hoveredColor;
	const previewColor = colorOptions.find((option) => option.id === previewColorId) ?? null;
	const colorStyle = previewColor ? { color: `var(${previewColor.cssVar})` } : undefined;
	const canResetIcon = showDefaultIcon && Boolean(iconValue);
	const canResetColor = showColors && colorValue !== null;

	let emptyLabel: string | null = null;
	if (picker.loading) emptyLabel = t("appearancePicker.loadingEmoji");
	else if (picker.error) emptyLabel = t("appearancePicker.emojiLoadFailed");
	else if (normalizedQuery && picker.results.length === 0) {
		emptyLabel = t("appearancePicker.noResults");
	}

	function setOpen(nextOpen: boolean) {
		if (open === undefined) setInternalOpen(nextOpen);
		onOpenChange?.(nextOpen);
		if (nextOpen) return;
		setQuery("");
		setModeChoice(null);
		setHoveredOption(null);
		setHoveredColor(undefined);
	}

	function applyIcon(option: AppearancePickerOption) {
		onIconChange(option.id, getDatabaseColumnIconOption(option.id));
	}

	function selectIcon(option: AppearancePickerOption) {
		rememberRecentIconId(option.id);
		applyIcon(option);
		setOpen(false);
	}

	function shuffleIcon() {
		const candidates = picker.results.filter((option) => option.id !== selectedIconName);
		const option = candidates[Math.floor(Math.random() * candidates.length)];
		if (option) applyIcon(option);
	}

	function reset() {
		if (onReset) onReset();
		else onIconChange(null, null);
		setOpen(false);
	}

	return (
		<>
			{trigger?.(() => setOpen(true))}
			<Dialog open={resolvedOpen} onOpenChange={setOpen}>
				<DialogContent
					className="commandPalette appearancePickerDialog top-[46%] gap-0 border-none bg-transparent p-0 shadow-none sm:max-w-[440px]"
					showCloseButton={false}
					initialFocus={inputRef}
				>
					<DialogTitle className="sr-only">{title}</DialogTitle>
					<div className="appearancePickerHeader">
						<AppearancePickerSummary
							iconName={previewIconName}
							title={previewLabel ?? title}
							subtitle={
								hoveredOption?.label ??
								picker.labelFor(selectedIconName) ??
								t("appearancePicker.defaultIcon")
							}
							colorStyle={colorStyle}
							onShuffle={shuffleIcon}
							onReset={canResetIcon || canResetColor ? reset : undefined}
						/>
						<div className="appearancePickerSearchRow">
							<div className="commandPaletteInputWrapper">
								<Search
									size="var(--icon-sm)"
									className="commandPaletteSearchIcon"
									aria-hidden="true"
								/>
								<Input
									ref={inputRef}
									value={query}
									placeholder={t(
										mode === "emoji"
											? "appearancePicker.searchEmojiPlaceholder"
											: "appearancePicker.searchPlaceholder",
									)}
									className="commandPaletteInput"
									onChange={(event) => setQuery(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "ArrowDown") {
											event.preventDefault();
											navigation.focusFirstOption();
											return;
										}
										const firstOption = picker.results[0];
										if (event.key !== "Enter" || !normalizedQuery || !firstOption) return;
										event.preventDefault();
										selectIcon(firstOption);
									}}
								/>
							</div>
							{allowEmoji ? (
								<AppearancePickerModes
									value={mode}
									onChange={(nextMode) => {
										setModeChoice(nextMode);
										setHoveredOption(null);
										inputRef.current?.focus();
									}}
								/>
							) : null}
						</div>
						{showColors ? (
							<AppearancePickerColors
								value={colorValue}
								options={colorOptions}
								onChange={(color) => onColorChange?.(color)}
								onHover={setHoveredColor}
							/>
						) : null}
					</div>
					<div className="commandPaletteBody appearancePickerBody">
						<AppearancePickerGrid
							key={`${mode}:${normalizedQuery ? "search" : "browse"}`}
							groups={picker.groups}
							emptyLabel={emptyLabel}
							selectedIconName={selectedIconName}
							iconStyle={colorStyle}
							registerOption={navigation.registerOption}
							onGridKeyDown={navigation.handleGridKeyDown}
							onHover={setHoveredOption}
							onSelect={selectIcon}
						/>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}

export function AppearancePickerIconTrigger({
	iconName,
	className,
	disabled,
	label,
	onClick,
}: {
	iconName: string;
	className?: string;
	disabled?: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-xs"
			className={`shrink-0${className ? ` ${className}` : ""}`}
			disabled={disabled}
			aria-label={label}
			onClick={(event) => {
				event.stopPropagation();
				onClick();
			}}
		>
			<DatabaseColumnIcon iconName={iconName} size="var(--icon-md)" />
		</Button>
	);
}
