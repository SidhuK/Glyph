import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import type {
	ThemeMode,
	UiAccent,
	UiDarkThemeId,
	UiLightThemeId,
} from "../../lib/settings";
import type { UiThemeOption, UiThemePreview } from "../../lib/uiThemes";
import { ChevronDown } from "../Icons";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { AppearanceThemeModePicker } from "./AppearanceThemeModePicker";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";
import { getAccentPreviewColor } from "./accentOptions";

interface AppearanceThemeCardProps {
	themeMode: ThemeMode;
	accent: UiAccent;
	lightTheme: UiThemeOption<UiLightThemeId>;
	darkTheme: UiThemeOption<UiDarkThemeId>;
	lightOptions: readonly UiThemeOption<UiLightThemeId>[];
	darkOptions: readonly UiThemeOption<UiDarkThemeId>[];
	translucentApp: boolean;
	onThemeModeChange: (mode: ThemeMode) => Promise<void>;
	onLightThemeChange: (themeId: UiLightThemeId) => Promise<void>;
	onDarkThemeChange: (themeId: UiDarkThemeId) => Promise<void>;
	onTranslucentAppChange: (enabled: boolean) => Promise<void>;
}

function resolvePreview<T extends string>(
	option: UiThemeOption<T>,
	mode: "light" | "dark",
	accent: UiAccent,
): UiThemePreview {
	if (option.id === "glyph-default" || option.id === "glyph-default-dark") {
		const accentColor = getAccentPreviewColor(accent, mode);
		return {
			...option.preview,
			accent: accentColor,
			badgeText: accentColor,
		};
	}
	return option.preview;
}

function sortThemeOptions<T extends string>(
	options: readonly UiThemeOption<T>[],
): UiThemeOption<T>[] {
	// sortThemeOptions assumes callers provide UiThemeOption<T>[] with the
	// default theme already in the first slot, so we preserve that entry and
	// alphabetize only the remaining choices for the dropdown.
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
	description,
	mode,
	selected,
	options,
	accent,
	onSelect,
}: {
	label: string;
	description?: string;
	mode: "light" | "dark";
	selected: UiThemeOption<T>;
	options: readonly UiThemeOption<T>[];
	accent: UiAccent;
	onSelect: (themeId: T) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const resolvedSelected = useMemo(
		() => ({
			...selected,
			preview: resolvePreview(selected, mode, accent),
		}),
		[selected, mode, accent],
	);
	const sortedOptions = useMemo(() => sortThemeOptions(options), [options]);

	return (
		<SettingsRow label={label} description={description} interactive={false}>
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
							const resolved = {
								...option,
								preview: resolvePreview(option, mode, accent),
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

export function AppearanceThemeCard({
	themeMode,
	accent,
	lightTheme,
	darkTheme,
	lightOptions,
	darkOptions,
	translucentApp,
	onThemeModeChange,
	onLightThemeChange,
	onDarkThemeChange,
	onTranslucentAppChange,
}: AppearanceThemeCardProps) {
	return (
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

			<ThemeSelector
				label="Light theme"
				mode="light"
				selected={lightTheme}
				options={lightOptions}
				accent={accent}
				onSelect={onLightThemeChange}
			/>

			<ThemeSelector
				label="Dark theme"
				mode="dark"
				selected={darkTheme}
				options={darkOptions}
				accent={accent}
				onSelect={onDarkThemeChange}
			/>

			<SettingsRow label="Translucent app">
				<SettingsToggle
					ariaLabel="Translucent app"
					checked={translucentApp}
					onCheckedChange={(checked) => void onTranslucentAppChange(checked)}
				/>
			</SettingsRow>
		</SettingsSection>
	);
}
