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
import { Input } from "./ui/shadcn/input";
import { Popover, PopoverContent } from "./ui/shadcn/popover";

interface AppearancePickerProps {
	title: string;
	trigger?: (openPicker: (anchor: Element) => void) => ReactNode;
	anchor?: Element | null;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	iconValue?: string | null;
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
	trigger,
	anchor,
	open,
	onOpenChange,
	iconValue,
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
	const inputRef = useRef<HTMLInputElement | null>(null);
	const triggerAnchorRef = useRef<Element | null>(null);
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
	const selectedColor = colorOptions.find((option) => option.id === colorValue) ?? null;
	const selectedStyle = selectedColor ? { color: `var(${selectedColor.cssVar})` } : undefined;
	const canReset = (showDefaultIcon && Boolean(iconValue)) || (showColors && colorValue !== null);

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
	}

	function selectIcon(option: AppearancePickerOption) {
		rememberRecentIconId(option.id);
		onIconChange(option.id, getDatabaseColumnIconOption(option.id));
		if (!showColors) setOpen(false);
	}

	function reset() {
		if (onReset) onReset();
		else onIconChange(null, null);
		setOpen(false);
	}

	const resetButton = canReset ? (
		<Button
			type="button"
			variant="ghost"
			size="xs"
			className="appearancePickerReset"
			onClick={reset}
		>
			{t("appearancePicker.reset")}
		</Button>
	) : null;

	return (
		<>
			{trigger?.((element) => {
				triggerAnchorRef.current = element;
				setOpen(true);
			})}
			<Popover open={resolvedOpen} onOpenChange={setOpen}>
				<PopoverContent
					anchor={anchor ?? triggerAnchorRef}
					side="right"
					align="start"
					sideOffset={8}
					collisionPadding={12}
					className="appearancePicker"
					aria-label={title}
					initialFocus={inputRef}
				>
					{allowEmoji ? (
						<div className="appearancePickerTabsRow">
							<AppearancePickerModes
								value={mode}
								onChange={(nextMode) => {
									setModeChoice(nextMode);
									inputRef.current?.focus();
								}}
							/>
							{resetButton}
						</div>
					) : null}
					<div className="appearancePickerSearchRow">
						<div className="appearancePickerSearch">
							<Search size="var(--icon-sm)" aria-hidden="true" />
							<Input
								ref={inputRef}
								value={query}
								placeholder={t(
									mode === "emoji"
										? "appearancePicker.searchEmojiPlaceholder"
										: "appearancePicker.searchPlaceholder",
								)}
								className="appearancePickerSearchInput"
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
						{allowEmoji ? null : resetButton}
					</div>
					<AppearancePickerGrid
						key={`${mode}:${normalizedQuery ? "search" : "browse"}`}
						groups={picker.groups}
						emptyLabel={emptyLabel}
						selectedIconName={selectedIconName}
						selectedStyle={selectedStyle}
						registerOption={navigation.registerOption}
						onGridKeyDown={navigation.handleGridKeyDown}
						onSelect={selectIcon}
					/>
					{showColors ? (
						<AppearancePickerColors
							value={colorValue}
							options={colorOptions}
							onChange={(color) => onColorChange?.(color)}
						/>
					) : null}
				</PopoverContent>
			</Popover>
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
	onClick: (anchor: Element) => void;
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
				onClick(event.currentTarget);
			}}
		>
			<DatabaseColumnIcon iconName={iconName} size="var(--icon-md)" />
		</Button>
	);
}
