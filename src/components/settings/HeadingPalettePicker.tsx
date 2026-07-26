import { cn } from "@/lib/utils";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useIsDarkTheme } from "../../hooks/useIsDarkTheme";
import {
	HEADING_PALETTE_OPTIONS,
	type HeadingPaletteId,
	getHeadingPalette,
} from "../../lib/headingPalettes";
import { ChevronDown } from "../Icons";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";

function HeadingPalettePreview({ colors }: { colors: readonly string[] }) {
	return (
		<span className="headingPalettePreview" aria-hidden="true">
			{colors.map((color, index) => (
				<span
					key={`${index}-${color}`}
					className="headingPaletteSwatch"
					style={{ color }}
				>
					H{index + 1}
				</span>
			))}
		</span>
	);
}

export function HeadingPalettePicker({
	value,
	disabled,
	onChange,
}: {
	value: HeadingPaletteId;
	disabled?: boolean;
	onChange: (value: HeadingPaletteId) => void;
}) {
	const { t } = useTranslation("settings.general");
	const [open, setOpen] = useState(false);
	const isDark = useIsDarkTheme();
	const selected = getHeadingPalette(value);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"appearanceThemeDropdownTrigger",
						"headingPaletteTrigger",
						open && "is-open",
					)}
					disabled={disabled}
					aria-label={t("editor.colorfulHeadings.palette.label")}
					aria-expanded={open}
				>
					<HeadingPalettePreview
						colors={isDark ? selected.dark : selected.light}
					/>
					<span className="appearanceThemeDropdownTitle">
						{t(`editor.colorfulHeadings.palette.options.${selected.id}`)}
					</span>
					<span
						className={cn("appearanceThemeDropdownChevron", open && "is-open")}
					>
						<ChevronDown size="var(--icon-md)" />
					</span>
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				side="bottom"
				sideOffset={8}
				className="appearanceThemeDropdownContent headingPaletteContent"
			>
				<div className="appearanceThemeDropdownHeader">
					<div className="appearanceThemeDropdownHeaderTitle">
						{t("editor.colorfulHeadings.palette.label")}
					</div>
				</div>
				<div className="appearanceThemeDropdownList">
					{HEADING_PALETTE_OPTIONS.map((palette) => {
						const isSelected = palette.id === selected.id;
						return (
							<button
								key={palette.id}
								type="button"
								className={cn(
									"appearanceThemeDropdownOption",
									"headingPaletteOption",
									isSelected && "is-selected",
								)}
								aria-pressed={isSelected}
								onClick={() => {
									onChange(palette.id);
									setOpen(false);
								}}
							>
								<span className="appearanceThemeDropdownOptionTitle">
									{t(`editor.colorfulHeadings.palette.options.${palette.id}`)}
								</span>
								<HeadingPalettePreview
									colors={isDark ? palette.dark : palette.light}
								/>
							</button>
						);
					})}
				</div>
			</PopoverContent>
		</Popover>
	);
}
