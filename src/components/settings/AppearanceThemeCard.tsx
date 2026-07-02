import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import type {
	ThemeMode,
	UiDarkThemeId,
	UiLightThemeId,
} from "../../lib/settings";
import {
	type UiThemeColorMode,
	type UiThemeColorOverrides,
	resolveUiThemeModeColors,
} from "../../lib/themeColors";
import type { UiThemeOption, UiThemePreview } from "../../lib/uiThemes";
import { ChevronDown } from "../Icons";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { AppearanceAccentPicker } from "./AppearanceAccentPicker";
import {
	AppearanceThemeColorControl,
	AppearanceThemeColorResetButton,
} from "./AppearanceThemeColorField";
import { AppearanceThemeModePicker } from "./AppearanceThemeModePicker";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";
import { getAccentPreviewColor } from "./accentOptions";
import type {
	AppearanceThemeColorsActions,
	AppearanceThemeColorsState,
} from "./useAppearanceThemeColors";

interface AppearanceThemeCardProps {
	themeMode: ThemeMode;
	lightTheme: UiThemeOption<UiLightThemeId>;
	darkTheme: UiThemeOption<UiDarkThemeId>;
	lightOptions: readonly UiThemeOption<UiLightThemeId>[];
	darkOptions: readonly UiThemeOption<UiDarkThemeId>[];
	translucentApp: boolean;
	appearance: AppearanceThemeColorsState;
	actions: AppearanceThemeColorsActions;
	onThemeModeChange: (mode: ThemeMode) => Promise<void>;
	onLightThemeChange: (themeId: UiLightThemeId) => Promise<void>;
	onDarkThemeChange: (themeId: UiDarkThemeId) => Promise<void>;
	onTranslucentAppChange: (enabled: boolean) => Promise<void>;
}

function resolvePreview<T extends string>(
	option: UiThemeOption<T>,
	mode: "light" | "dark",
	accent: AppearanceThemeColorsState["accent"],
	resolvedColors?: { background: string; foreground: string },
): UiThemePreview {
	const preview = resolvedColors
		? {
				...option.preview,
				surface: resolvedColors.background,
				text: resolvedColors.foreground,
			}
		: option.preview;

	if (option.id === "glyph-default" || option.id === "glyph-default-dark") {
		const accentColor = getAccentPreviewColor(accent, mode);
		return {
			...preview,
			accent: accentColor,
			badgeText: accentColor,
		};
	}
	return preview;
}

function sortThemeOptions<T extends string>(
	options: readonly UiThemeOption<T>[],
): UiThemeOption<T>[] {
	if (options.length <= 1) return [...options];
	const [defaultOption, ...rest] = options;
	return [
		defaultOption,
		...rest.sort((a, b) => a.label.localeCompare(b.label)),
	];
}

function getPreviewStyle(preview: UiThemePreview): CSSProperties {
	return {
		"--theme-preview-accent": preview.accent,
		"--theme-preview-surface": preview.surface,
		"--theme-preview-surface-alt": preview.surfaceAlt,
		"--theme-preview-text": preview.text,
		"--theme-preview-badge-bg": preview.badgeBackground,
		"--theme-preview-badge-border": preview.badgeBorder,
		"--theme-preview-badge-text": preview.badgeText,
		"--theme-preview-border": preview.border ?? preview.badgeBorder,
	} as CSSProperties;
}

function ThemeSelector<T extends string>({
	label,
	mode,
	selected,
	options,
	accent,
	resolvedColors,
	onSelect,
}: {
	label: string;
	mode: "light" | "dark";
	selected: UiThemeOption<T>;
	options: readonly UiThemeOption<T>[];
	accent: AppearanceThemeColorsState["accent"];
	resolvedColors?: { background: string; foreground: string };
	onSelect: (themeId: T) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const resolvedSelected = useMemo(
		() => ({
			...selected,
			preview: resolvePreview(selected, mode, accent, resolvedColors),
		}),
		[accent, mode, resolvedColors, selected],
	);
	const sortedOptions = useMemo(() => sortThemeOptions(options), [options]);

	return (
		<SettingsRow label={label} interactive={false}>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="appearanceThemeDropdownTrigger"
						style={getPreviewStyle(resolvedSelected.preview)}
						aria-expanded={open}
					>
						<span className="appearanceThemeDropdownLeading">
							<span className="appearanceThemeBadge">Aa</span>
							<span className="appearanceThemeDropdownCopy">
								<span className="appearanceThemeDropdownTitle">
									{resolvedSelected.label}
								</span>
								<span className="appearanceThemeDropdownDescription">
									{resolvedSelected.description}
								</span>
							</span>
						</span>
						<span
							className={cn(
								"appearanceThemeDropdownChevron",
								open && "is-open",
							)}
						>
							<ChevronDown size="var(--icon-md)" />
						</span>
					</button>
				</PopoverTrigger>
				<PopoverContent
					align="end"
					side="bottom"
					sideOffset={8}
					avoidCollisions={false}
					collisionPadding={16}
					className="appearanceThemeDropdownContent"
				>
					<div className="appearanceThemeDropdownHeader">
						<div className="appearanceThemeDropdownHeaderTitle">{label}</div>
						<div className="appearanceThemeDropdownHeaderHint">
							{mode === "light"
								? "Pick the palette Glyph uses in light mode."
								: "Pick the palette Glyph uses in dark mode."}
						</div>
					</div>
					<div className="appearanceThemeDropdownList">
						{sortedOptions.map((option) => {
							const isDefaultGlyphTheme =
								option.id === "glyph-default" ||
								option.id === "glyph-default-dark";
							const resolved = {
								...option,
								preview: resolvePreview(
									option,
									mode,
									accent,
									isDefaultGlyphTheme ? resolvedColors : undefined,
								),
							};
							const selectedOption = selected.id === option.id;
							return (
								<button
									key={option.id}
									type="button"
									className={cn(
										"appearanceThemeDropdownOption",
										selectedOption && "is-selected",
									)}
									style={getPreviewStyle(resolved.preview)}
									onClick={() => {
										void onSelect(option.id);
										setOpen(false);
									}}
									aria-pressed={selectedOption}
								>
									<span className="appearanceThemeDropdownOptionLead">
										<span className="appearanceThemeBadge">Aa</span>
										<span className="appearanceThemeDropdownOptionCopy">
											<span className="appearanceThemeDropdownOptionTitle">
												{option.label}
											</span>
											<span className="appearanceThemeDropdownOptionDescription">
												{option.description}
											</span>
										</span>
									</span>
								</button>
							);
						})}
					</div>
				</PopoverContent>
			</Popover>
		</SettingsRow>
	);
}

interface ThemeModeSectionProps<T extends string> {
	title: string;
	mode: UiThemeColorMode;
	theme: UiThemeOption<T>;
	themeOptions: readonly UiThemeOption<T>[];
	accent: AppearanceThemeColorsState["accent"];
	showColorPickers: boolean;
	backgroundColor: string;
	foregroundColor: string;
	themeColors: UiThemeColorOverrides;
	resolvedColors?: { background: string; foreground: string };
	onThemeChange: (themeId: T) => Promise<void>;
	onThemeColorChange: AppearanceThemeColorsActions["onThemeColorChange"];
}

function ThemeModeSection<T extends string>({
	title,
	mode,
	theme,
	themeOptions,
	accent,
	showColorPickers,
	backgroundColor,
	foregroundColor,
	themeColors,
	resolvedColors,
	onThemeChange,
	onThemeColorChange,
}: ThemeModeSectionProps<T>) {
	const modeOverrides = themeColors[mode];

	return (
		<SettingsSection title={title}>
			<ThemeSelector
				label="Preset"
				mode={mode}
				selected={theme}
				options={themeOptions}
				accent={accent}
				resolvedColors={showColorPickers ? resolvedColors : undefined}
				onSelect={onThemeChange}
			/>

			{showColorPickers ? (
				<>
					<SettingsRow label="Background" interactive={false}>
						<AppearanceThemeColorControl
							color={backgroundColor}
							editable
							canReset={modeOverrides.background !== null}
							onChange={(color) =>
								void onThemeColorChange(mode, "background", color)
							}
							onReset={() => void onThemeColorChange(mode, "background", null)}
							resetAriaLabel={`Reset ${title.toLowerCase()} background`}
							aria-label={`${title} background color`}
						/>
					</SettingsRow>

					<SettingsRow label="Foreground" interactive={false}>
						<AppearanceThemeColorControl
							color={foregroundColor}
							editable
							canReset={modeOverrides.foreground !== null}
							onChange={(color) =>
								void onThemeColorChange(mode, "foreground", color)
							}
							onReset={() => void onThemeColorChange(mode, "foreground", null)}
							resetAriaLabel={`Reset ${title.toLowerCase()} foreground`}
							aria-label={`${title} foreground color`}
						/>
					</SettingsRow>
				</>
			) : null}
		</SettingsSection>
	);
}

export function AppearanceThemeCard({
	themeMode,
	lightTheme,
	darkTheme,
	lightOptions,
	darkOptions,
	translucentApp,
	appearance,
	actions,
	onThemeModeChange,
	onLightThemeChange,
	onDarkThemeChange,
	onTranslucentAppChange,
}: AppearanceThemeCardProps) {
	const {
		accent,
		themeColors,
		showLightColorPickers,
		showDarkColorPickers,
		showAccentPicker,
	} = appearance;
	const { onAccentChange, onAccentReset, onThemeColorChange } = actions;
	const canResetAccent = accent !== "neutral";
	const lightPreview = useMemo(
		() => resolvePreview(lightTheme, "light", accent, undefined),
		[accent, lightTheme],
	);
	const darkPreview = useMemo(
		() => resolvePreview(darkTheme, "dark", accent, undefined),
		[accent, darkTheme],
	);
	const lightColors = useMemo(
		() =>
			resolveUiThemeModeColors(themeColors.light, {
				background: lightPreview.surface,
				foreground: lightPreview.text,
			}),
		[lightPreview.surface, lightPreview.text, themeColors.light],
	);
	const darkColors = useMemo(
		() =>
			resolveUiThemeModeColors(themeColors.dark, {
				background: darkPreview.surface,
				foreground: darkPreview.text,
			}),
		[darkPreview.surface, darkPreview.text, themeColors.dark],
	);

	return (
		<>
			<SettingsSection
				title="Theme"
				description="Mix and match light and dark theme families."
			>
				<SettingsRow
					label="Appearance"
					description="Follow your system or lock Glyph to light or dark mode."
					interactive={false}
				>
					<AppearanceThemeModePicker
						themeMode={themeMode}
						onThemeModeChange={onThemeModeChange}
					/>
				</SettingsRow>

				<SettingsRow label="Translucent sidebar">
					<SettingsToggle
						ariaLabel="Translucent sidebar"
						checked={translucentApp}
						onCheckedChange={(checked) => void onTranslucentAppChange(checked)}
					/>
				</SettingsRow>
			</SettingsSection>

			{showAccentPicker ? (
				<SettingsSection
					title="Accent"
					description="Applies to the default light and dark themes."
				>
					<SettingsRow
						label="Palette"
						description="Sets the accent for highlights, focus rings, and emphasis."
						interactive={false}
					>
						<div className="appearanceThemeColorControl">
							<AppearanceAccentPicker
								accent={accent}
								onAccentChange={onAccentChange}
								aria-label="Accent color"
							/>
							<AppearanceThemeColorResetButton
								disabled={!canResetAccent}
								onClick={() => void onAccentReset()}
								ariaLabel="Reset accent"
							/>
						</div>
					</SettingsRow>
				</SettingsSection>
			) : null}

			<ThemeModeSection
				title="Light theme"
				mode="light"
				theme={lightTheme}
				themeOptions={lightOptions}
				accent={accent}
				showColorPickers={showLightColorPickers}
				backgroundColor={lightColors.background}
				foregroundColor={lightColors.foreground}
				themeColors={themeColors}
				resolvedColors={lightColors}
				onThemeChange={onLightThemeChange}
				onThemeColorChange={onThemeColorChange}
			/>

			<ThemeModeSection
				title="Dark theme"
				mode="dark"
				theme={darkTheme}
				themeOptions={darkOptions}
				accent={accent}
				showColorPickers={showDarkColorPickers}
				backgroundColor={darkColors.background}
				foregroundColor={darkColors.foreground}
				themeColors={themeColors}
				resolvedColors={darkColors}
				onThemeChange={onDarkThemeChange}
				onThemeColorChange={onThemeColorChange}
			/>
		</>
	);
}
