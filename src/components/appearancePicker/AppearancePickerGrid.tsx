import type { CSSProperties, KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { AppearanceIcon } from "../AppearanceIcon";
import type { AppearancePickerGroup, AppearancePickerOption } from "./useAppearancePickerGroups";

interface AppearancePickerGridProps {
	groups: readonly AppearancePickerGroup[];
	emptyLabel: string | null;
	selectedIconName: string | null;
	selectedStyle?: CSSProperties;
	registerOption: (key: string) => (node: HTMLButtonElement | null) => void;
	onGridKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
	onSelect: (option: AppearancePickerOption) => void;
}

export function AppearancePickerGrid({
	groups,
	emptyLabel,
	selectedIconName,
	selectedStyle,
	registerOption,
	onGridKeyDown,
	onSelect,
}: AppearancePickerGridProps) {
	const { t } = useTranslation("shell");
	return (
		<div className="appearancePickerScroll" onKeyDown={onGridKeyDown}>
			{emptyLabel ? <div className="appearancePickerEmpty">{emptyLabel}</div> : null}
			{groups.map((group) => (
				<section
					key={group.id}
					className="appearancePickerSection"
					aria-label={group.label || undefined}
				>
					{group.label ? <div className="appearancePickerCategoryLabel">{group.label}</div> : null}
					<div className="appearancePickerGrid">
						{group.options.map((option) => {
							const selected = option.id === selectedIconName;
							return (
								<button
									key={option.id}
									ref={registerOption(`${group.id}:${option.id}`)}
									type="button"
									title={option.label}
									aria-label={t("appearancePicker.useIcon", { label: option.label })}
									aria-pressed={selected}
									className="appearancePickerOption"
									style={selected ? selectedStyle : undefined}
									onClick={() => onSelect(option)}
								>
									<AppearanceIcon iconName={option.id} size="var(--icon-lg)" />
								</button>
							);
						})}
					</div>
				</section>
			))}
		</div>
	);
}
