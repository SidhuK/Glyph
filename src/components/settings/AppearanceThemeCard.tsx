import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
	ThemeMode,
	UiDarkThemeId,
	UiLightThemeId,
} from "../../lib/settings";
import {
	type UiThemeOption,
	type UiThemePreview,
	sortUiThemeOptions,
} from "../../lib/uiThemes";
import { ChevronDown } from "../Icons";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { AppearanceThemeModePicker } from "./AppearanceThemeModePicker";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";

interface AppearanceThemeCardProps {
	themeMode: ThemeMode;
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

function getBadgeStyle(preview: UiThemePreview): CSSProperties {
	return {
		"--theme-preview-badge-bg": preview.badgeBackground,
		"--theme-preview-badge-border": preview.badgeBorder,
		"--theme-preview-badge-text": preview.badgeText,
	} as CSSProperties;
}

function ThemeSelector<T extends string>({
	label,
	hint,
	mode,
	selected,
	options,
	onSelect,
}: {
	label: string;
	hint: string;
	mode: "light" | "dark";
	selected: UiThemeOption<T>;
	options: readonly UiThemeOption<T>[];
	onSelect: (themeId: T) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const sortedOptions = useMemo(
		() => sortUiThemeOptions(options, mode),
		[mode, options],
	);

	return (
		<SettingsRow label={label} interactive={false}>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className={cn("appearanceThemeDropdownTrigger", open && "is-open")}
						style={getBadgeStyle(selected.preview)}
						aria-expanded={open}
					>
						<span className="appearanceThemeDropdownLeading">
							<span className="appearanceThemeBadge">Aa</span>
							<span className="appearanceThemeDropdownTitle">
								{selected.label}
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
						<div className="appearanceThemeDropdownHeaderHint">{hint}</div>
					</div>
					<div className="appearanceThemeDropdownList">
						{sortedOptions.map((option) => {
							const selectedOption = selected.id === option.id;
							return (
								<button
									key={option.id}
									type="button"
									className={cn(
										"appearanceThemeDropdownOption",
										selectedOption && "is-selected",
									)}
									style={getBadgeStyle(option.preview)}
									onClick={() => {
										void onSelect(option.id);
										setOpen(false);
									}}
									aria-pressed={selectedOption}
								>
									<span className="appearanceThemeDropdownOptionLead">
										<span className="appearanceThemeBadge">Aa</span>
										<span className="appearanceThemeDropdownOptionTitle">
											{option.label}
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
	const { t } = useTranslation("settings.appearance");
	return (
		<SettingsSection
			title={t("theme.sectionTitle")}
			description={t("theme.sectionDescription")}
		>
			<SettingsRow
				label={t("theme.appearance.label")}
				description={t("theme.appearance.description")}
				interactive={false}
			>
				<AppearanceThemeModePicker
					themeMode={themeMode}
					onThemeModeChange={onThemeModeChange}
				/>
			</SettingsRow>

			<ThemeSelector
				label={t("lightTheme.label")}
				hint={t("lightTheme.hint")}
				mode="light"
				selected={lightTheme}
				options={lightOptions}
				onSelect={onLightThemeChange}
			/>

			<ThemeSelector
				label={t("darkTheme.label")}
				hint={t("darkTheme.hint")}
				mode="dark"
				selected={darkTheme}
				options={darkOptions}
				onSelect={onDarkThemeChange}
			/>

			<SettingsRow label={t("theme.translucentSidebar.label")}>
				<SettingsToggle
					ariaLabel={t("theme.translucentSidebar.ariaLabel")}
					checked={translucentApp}
					onCheckedChange={(checked) => void onTranslucentAppChange(checked)}
				/>
			</SettingsRow>
		</SettingsSection>
	);
}
