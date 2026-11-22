import { useSettingsPaneFilter } from "./SettingsSearchContext";
import { splitFirstMatch } from "./settingsSearchFilter";

export function SettingsSearchHighlight({ text }: { text: string }) {
	const pane = useSettingsPaneFilter();
	const parts = pane ? splitFirstMatch(text, pane.filter.tokens) : null;
	if (!parts) return text;
	return (
		<>
			{parts.before}
			<mark className="settingsSearchMark">{parts.match}</mark>
			{parts.after}
		</>
	);
}
