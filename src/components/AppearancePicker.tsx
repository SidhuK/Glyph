import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import {
	DATABASE_COLUMN_ICON_OPTIONS,
	type DatabaseColumnIconOption,
	ICON_CATEGORY_LABELS,
	type IconCategory,
	getDatabaseColumnIconOption,
} from "../lib/database/columnIcons";
import { Search } from "./Icons";
import { DatabaseColumnIcon } from "./database/DatabaseColumnIcon";
import {
	EDITOR_TEXT_COLORS,
	type EditorTextColor,
	type EditorTextColorOption,
} from "./editor/textColors";
import { Button } from "./ui/shadcn/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/shadcn/dialog";
import { Input } from "./ui/shadcn/input";
import { ScrollArea } from "./ui/shadcn/scroll-area";

interface AppearancePickerProps {
	title: string;
	trigger?: (openPicker: () => void) => ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	iconValue?: string | null;
	defaultIconName?: string;
	iconOptions?: readonly DatabaseColumnIconOption[];
	onIconChange?: (
		iconName: string | null,
		option: DatabaseColumnIconOption | null,
	) => void;
	showDefaultIcon?: boolean;
	colorValue?: EditorTextColor | null;
	colorOptions?: readonly EditorTextColorOption[];
	onColorChange?: (color: EditorTextColor | null) => void;
	showColors?: boolean;
}

export function AppearancePicker({
	title,
	trigger,
	open,
	onOpenChange,
	iconValue,
	defaultIconName = "tag",
	iconOptions = DATABASE_COLUMN_ICON_OPTIONS,
	onIconChange,
	showDefaultIcon = false,
	colorValue = null,
	colorOptions = EDITOR_TEXT_COLORS,
	onColorChange,
	showColors = false,
}: AppearancePickerProps) {
	const [internalOpen, setInternalOpen] = useState(false);
	const [query, setQuery] = useState("");
	const hasQuery = query.trim().length > 0;
	const inputRef = useRef<HTMLInputElement | null>(null);
	const resolvedOpen = open ?? internalOpen;
	const selectedIconName = getDatabaseColumnIconOption(iconValue)
		? iconValue
		: defaultIconName;

	const filteredOptions = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		if (!normalizedQuery) return iconOptions;
		return iconOptions.filter(
			(option) =>
				option.id.includes(normalizedQuery) ||
				option.label.toLowerCase().includes(normalizedQuery),
		);
	}, [iconOptions, query]);

	const groupedByCategory = useMemo(() => {
		const categoryOrder: IconCategory[] = [
			"write",
			"media",
			"food",
			"weather",
			"sort",
			"find",
			"talk",
			"time",
			"do",
			"fun",
			"science",
		];
		const groups = new Map<IconCategory, DatabaseColumnIconOption[]>();
		for (const cat of categoryOrder) {
			groups.set(cat, []);
		}
		for (const option of filteredOptions) {
			const cat = option.category;
			if (groups.has(cat)) {
				groups.get(cat)?.push(option);
			}
		}
		return groups;
	}, [filteredOptions]);

	function setOpen(nextOpen: boolean) {
		if (open === undefined) setInternalOpen(nextOpen);
		onOpenChange?.(nextOpen);
		if (!nextOpen) {
			setQuery("");
			return;
		}
		window.requestAnimationFrame(() => inputRef.current?.focus());
	}

	return (
		<>
			{trigger?.(() => setOpen(true))}
			<Dialog open={resolvedOpen} onOpenChange={setOpen}>
				<DialogContent
					className="commandPalette appearancePickerDialog top-[46%] gap-0 border-none bg-transparent p-0 shadow-none sm:max-w-[420px]"
					showCloseButton={false}
				>
					<DialogTitle className="sr-only">{title}</DialogTitle>
					<div className="commandPaletteHeader">
						<div className="commandPaletteInputWrapper">
							<Search
								size="var(--icon-sm)"
								className="commandPaletteSearchIcon"
								aria-hidden="true"
							/>
							<Input
								ref={inputRef}
								value={query}
								placeholder="Search icons"
								className="commandPaletteInput"
								onChange={(event) => setQuery(event.target.value)}
							/>
						</div>
						{showColors ? (
							<div className="appearancePickerColors" aria-label="Colors">
								<button
									type="button"
									className="appearancePickerColor"
									data-active={colorValue === null ? "true" : undefined}
									onClick={() => {
										onColorChange?.(null);
										setOpen(false);
									}}
								>
									<span className="appearancePickerDefaultColor" />
									<span>Default</span>
								</button>
								{colorOptions.map((color) => (
									<button
										key={color.id}
										type="button"
										className="appearancePickerColor"
										data-active={colorValue === color.id ? "true" : undefined}
										onClick={() => {
											onColorChange?.(color.id);
											setOpen(false);
										}}
									>
										<span
											className="appearancePickerSwatch"
											style={{ color: `var(${color.cssVar})` }}
										/>
										<span>{color.label}</span>
									</button>
								))}
							</div>
						) : null}
					</div>
					<div className="commandPaletteBody">
						<ScrollArea className="appearancePickerScroll">
							{showDefaultIcon ? (
								<div className="appearancePickerGrid appearancePickerDefaultSection">
									<Button
										type="button"
										variant={iconValue ? "ghost" : "secondary"}
										size="icon-sm"
										title="Default icon"
										aria-label="Use default icon"
										className="appearancePickerOption"
										onClick={() => {
											onIconChange?.(null, null);
											setOpen(false);
										}}
									>
										<DatabaseColumnIcon
											iconName={defaultIconName}
											size="var(--icon-lg)"
										/>
									</Button>
								</div>
							) : null}
							{hasQuery ? (
								<div className="appearancePickerGrid">
									{filteredOptions.map((option) => {
										const active =
											option.id === selectedIconName && Boolean(iconValue);
										return (
											<Button
												key={option.id}
												type="button"
												variant={active ? "secondary" : "ghost"}
												size="icon-sm"
												title={option.label}
												aria-label={`Use ${option.label} icon`}
												aria-pressed={active}
												className="appearancePickerOption"
												onClick={() => {
													onIconChange?.(option.id, option);
													setOpen(false);
												}}
											>
												<DatabaseColumnIcon
													iconName={option.id}
													size="var(--icon-lg)"
												/>
											</Button>
										);
									})}
									{filteredOptions.length === 0 ? (
										<div className="appearancePickerEmpty">No icons found.</div>
									) : null}
								</div>
							) : (
								Array.from(groupedByCategory.entries()).map(
									([category, options]) => {
										if (options.length === 0) return null;
										return (
											<div key={category} className="appearancePickerSection">
												<div className="appearancePickerCategoryLabel">
													{ICON_CATEGORY_LABELS[category]}
												</div>
												<div className="appearancePickerGrid">
													{options.map((option) => {
														const active =
															option.id === selectedIconName &&
															Boolean(iconValue);
														return (
															<Button
																key={option.id}
																type="button"
																variant={active ? "secondary" : "ghost"}
																size="icon-sm"
																title={option.label}
																aria-label={`Use ${option.label} icon`}
																aria-pressed={active}
																className="appearancePickerOption"
																onClick={() => {
																	onIconChange?.(option.id, option);
																	setOpen(false);
																}}
															>
																<DatabaseColumnIcon
																	iconName={option.id}
																	size="var(--icon-lg)"
																/>
															</Button>
														);
													})}
												</div>
											</div>
										);
									},
								)
							)}
						</ScrollArea>
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
