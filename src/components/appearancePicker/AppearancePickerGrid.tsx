import type { CSSProperties, KeyboardEvent } from "react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppearanceIcon } from "../AppearanceIcon";
import type { AppearancePickerGroup, AppearancePickerOption } from "./useAppearancePickerGroups";

interface AppearancePickerGridProps {
	groups: readonly AppearancePickerGroup[];
	emptyLabel: string | null;
	selectedIconName: string | null;
	iconStyle?: CSSProperties;
	registerOption: (key: string) => (node: HTMLButtonElement | null) => void;
	onGridKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
	onHover: (option: AppearancePickerOption | null) => void;
	onSelect: (option: AppearancePickerOption) => void;
}

export function AppearancePickerGrid({
	groups,
	emptyLabel,
	selectedIconName,
	iconStyle,
	registerOption,
	onGridKeyDown,
	onHover,
	onSelect,
}: AppearancePickerGridProps) {
	const { t } = useTranslation("shell");
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const sectionRefs = useRef(new Map<string, HTMLElement>());
	const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
	const resolvedActiveGroupId = activeGroupId ?? groups[0]?.id ?? null;

	function syncActiveGroup({ scrollTop, clientHeight, scrollHeight }: HTMLDivElement) {
		// A short final section never reaches the top, so the scroll end selects it.
		if (scrollTop + clientHeight >= scrollHeight - 1) {
			setActiveGroupId(groups[groups.length - 1]?.id ?? null);
			return;
		}
		let current = groups[0]?.id ?? null;
		for (const group of groups) {
			const section = sectionRefs.current.get(group.id);
			if (section && section.offsetTop <= scrollTop + 1) current = group.id;
		}
		setActiveGroupId(current);
	}

	function jumpToGroup(groupId: string) {
		const section = sectionRefs.current.get(groupId);
		if (!section || !scrollRef.current) return;
		scrollRef.current.scrollTop = section.offsetTop;
		setActiveGroupId(groupId);
	}

	return (
		<>
			<div
				ref={scrollRef}
				className="appearancePickerScroll"
				style={iconStyle}
				onScroll={(event) => syncActiveGroup(event.currentTarget)}
				onMouseLeave={() => onHover(null)}
				onKeyDown={onGridKeyDown}
			>
				{emptyLabel ? <div className="appearancePickerEmpty">{emptyLabel}</div> : null}
				{groups.map((group) => (
					<section
						key={group.id}
						ref={(node) => {
							if (node) sectionRefs.current.set(group.id, node);
							else sectionRefs.current.delete(group.id);
						}}
						className="appearancePickerSection"
						aria-label={group.label || undefined}
					>
						{group.label ? (
							<div className="appearancePickerCategoryLabel">{group.label}</div>
						) : null}
						<div className="appearancePickerGrid">
							{group.options.map((option) => (
								<button
									key={option.id}
									ref={registerOption(`${group.id}:${option.id}`)}
									type="button"
									title={option.label}
									aria-label={t("appearancePicker.useIcon", { label: option.label })}
									aria-pressed={option.id === selectedIconName}
									className="appearancePickerOption"
									onMouseEnter={() => onHover(option)}
									onFocus={() => onHover(option)}
									onClick={() => onSelect(option)}
								>
									<AppearanceIcon iconName={option.id} size="var(--icon-lg)" />
								</button>
							))}
						</div>
					</section>
				))}
			</div>
			{groups.length > 1 ? (
				<nav className="appearancePickerTabs" aria-label={t("appearancePicker.categoriesLabel")}>
					{groups.map((group) => (
						<button
							key={group.id}
							type="button"
							title={group.label}
							aria-label={group.label}
							aria-current={group.id === resolvedActiveGroupId ? "true" : undefined}
							className="appearancePickerTab"
							onClick={() => jumpToGroup(group.id)}
						>
							<AppearanceIcon iconName={group.tabIconName} size="var(--icon-md)" />
						</button>
					))}
				</nav>
			) : null}
		</>
	);
}
