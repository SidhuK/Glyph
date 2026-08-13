import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
	ThemeMode,
	UiDarkThemeId,
	UiLightThemeId,
} from "../../lib/settings";
import { type UiThemeOption, sortUiThemeOptions } from "../../lib/uiThemes";
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

function ThemeBadge({
	mode,
	themeId,
}: { mode: "light" | "dark"; themeId: string }) {
	return (
		<span
			className={cn("appearanceThemeBadge appearanceThemePreview", mode)}
			data-light-theme={mode === "light" ? themeId : undefined}
			data-dark-theme={mode === "dark" ? themeId : undefined}
		>
			Aa
		</span>
	);
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
						aria-expanded={open}
					>
						<span className="appearanceThemeDropdownLeading">
							<ThemeBadge mode={mode} themeId={selected.id} />
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
									onClick={() => {
										void onSelect(option.id);
										setOpen(false);
									}}
									aria-pressed={selectedOption}
								>
									<span className="appearanceThemeDropdownOptionLead">
										<ThemeBadge mode={mode} themeId={option.id} />
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
