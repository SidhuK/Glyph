import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import type { CustomUiThemeId } from "../../../lib/customThemes";
import {
	type UiThemeOption,
	getGlyphDefaultThemeId,
	sortUiThemeOptions,
} from "../../../lib/uiThemes";
import { CustomThemeCardMenu } from "./CustomThemeCardMenu";
import { ThemeCard, type ThemeCardMode } from "./ThemeCard";

interface ThemeCardRowProps {
	mode: ThemeCardMode;
	label: string;
	builtIns: readonly UiThemeOption<string>[];
	customOptions: readonly UiThemeOption<CustomUiThemeId>[];
	selectedId: string | undefined;
	onSelect: (id: string) => void;
	onRemove: (id: CustomUiThemeId) => void;
	removing: boolean;
}

function ThemeCardGroup({ caption, children }: { caption: string; children: ReactNode }) {
	const captionId = useId();
	return (
		<div className="themeCardGroup" role="group" aria-labelledby={captionId}>
			<div id={captionId} className="themeCardGroupCaption">
				{caption}
			</div>
			<div className="themeCardGroupCards">{children}</div>
		</div>
	);
}

/** Opens with the chosen card centred when it would otherwise start off-screen. */
function centerCheckedCard(scroller: HTMLDivElement | null) {
	const card = scroller?.querySelector("input:checked")?.closest<HTMLElement>(".themeCard");
	if (!scroller || !card) return;
	scroller.scrollTo({
		left: card.offsetLeft - (scroller.clientWidth - card.offsetWidth) / 2,
		behavior: "instant",
	});
}

/** One radio group for a mode: Default | Built-in | Custom, in a single scrolling row. */
export function ThemeCardRow({
	mode,
	label,
	builtIns,
	customOptions,
	selectedId,
	onSelect,
	onRemove,
	removing,
}: ThemeCardRowProps) {
	const { t } = useTranslation("settings.appearance");
	const groupName = `settings-${mode}-theme`;
	const defaultId = getGlyphDefaultThemeId(mode);
	const defaults = builtIns.filter((option) => option.id === defaultId);
	const others = sortUiThemeOptions(
		builtIns.filter((option) => option.id !== defaultId),
		mode,
	);
	const customs = [...customOptions].sort((a, b) => a.label.localeCompare(b.label));

	const renderCard = (option: UiThemeOption<string>, menu?: ReactNode) => (
		<ThemeCard
			key={option.id}
			mode={mode}
			groupName={groupName}
			option={option}
			checked={option.id === selectedId}
			onSelect={onSelect}
			menu={menu}
		/>
	);

	return (
		<fieldset className="themeCardRow" aria-label={label}>
			<div ref={centerCheckedCard} className="themeCardScroller">
				<ThemeCardGroup caption={t("themeCards.groups.default")}>
					{defaults.map((option) => renderCard(option))}
				</ThemeCardGroup>
				<span className="themeCardGroupSeparator" aria-hidden="true" />
				<ThemeCardGroup caption={t("themeCards.groups.builtIn")}>
					{others.map((option) => renderCard(option))}
				</ThemeCardGroup>
				{customs.length > 0 ? (
					<>
						<span className="themeCardGroupSeparator" aria-hidden="true" />
						<ThemeCardGroup caption={t("themeCards.groups.custom")}>
							{customs.map((option) =>
								renderCard(
									option,
									<CustomThemeCardMenu
										name={option.label}
										disabled={removing}
										onRemove={() => onRemove(option.id)}
									/>,
								),
							)}
						</ThemeCardGroup>
					</>
				) : null}
			</div>
		</fieldset>
	);
}
