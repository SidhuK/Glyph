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
import { ChevronDown, Computer, Moon, Sun } from "../Icons";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import {
	SettingsRow,
	SettingsSection,
	SettingsSegmented,
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

function ThemeShowcase({
	label,
	option,
	active,
}: {
	label: string;
	option: UiThemeOption<string>;
	active: boolean;
}) {
	return (
		<div
			className={cn("appearanceThemeShowcase", active && "is-active")}
			style={getPreviewStyle(option.preview)}
		>
			<div className="appearanceThemeShowcaseHeader">
				<div>
					<div className="appearanceThemeShowcaseLabel">{label}</div>
					<div className="appearanceThemeShowcaseTitle">{option.label}</div>
				</div>
			</div>
			<div className="appearanceThemeShowcaseCanvas" aria-hidden="true">
				<div className="appearanceThemeShowcaseWindow">
					<div className="appearanceThemeShowcaseSidebar" />
					<div className="appearanceThemeShowcaseEditor">
						<span className="appearanceThemeShowcaseLine is-accent" />
						<span className="appearanceThemeShowcaseLine" />
						<span className="appearanceThemeShowcaseLine is-short" />
					</div>
				</div>
				<div className="appearanceThemeShowcaseMeta">
					<span className="appearanceThemeBadge">Aa</span>
					<div className="appearanceThemeSwatches">
						<span />
						<span />
						<span />
					</div>
				</div>
			</div>
			<p className="appearanceThemeShowcaseDescription">{option.description}</p>
		</div>
	);
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
							<ChevronDown size={14} />
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
	const resolvedLightTheme = {
		...lightTheme,
		preview: resolvePreview(lightTheme, "light", accent),
	};
	const resolvedDarkTheme = {
		...darkTheme,
		preview: resolvePreview(darkTheme, "dark", accent),
	};

	return (
		<SettingsSection
			title="Theme"
			description="Mix and match light and dark theme families with quick visual previews."
		>
			<SettingsRow label="Color mode">
				<SettingsSegmented<ThemeMode>
					ariaLabel="Theme mode"
					value={themeMode}
					onChange={(value) => void onThemeModeChange(value)}
					options={[
						{
							label: "Light",
							value: "light",
							icon: <Sun size={16} strokeWidth={1.7} />,
						},
						{
							label: "Dark",
							value: "dark",
							icon: <Moon size={16} strokeWidth={1.7} />,
						},
						{
							label: "System",
							value: "system",
							icon: <Computer size={16} strokeWidth={1.7} />,
						},
					]}
				/>
			</SettingsRow>

			<div className="appearanceThemeStage">
				<ThemeShowcase
					label="Light theme"
					option={resolvedLightTheme}
					active={themeMode === "light"}
				/>
				<ThemeShowcase
					label="Dark theme"
					option={resolvedDarkTheme}
					active={themeMode === "dark"}
				/>
			</div>

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
