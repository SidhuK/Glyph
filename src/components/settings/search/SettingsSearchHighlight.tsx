import { useSettingsPaneFilter } from "./SettingsSearchContext";
import { isMatchedRow, splitFirstMatch } from "./settingsSearchFilter";

export function SettingsSearchHighlight({ text, searchId }: { text: string; searchId?: string }) {
	const pane = useSettingsPaneFilter();
	if (!pane || !isMatchedRow(pane, { searchId, title: text })) return text;
	const parts = splitFirstMatch(text, pane.filter.tokens);
	if (!parts) return <mark className="settingsSearchMark">{text}</mark>;
	return (
		<>
			{parts.before}
			<mark className="settingsSearchMark">{parts.match}</mark>
			{parts.after}
		</>
	);
}
