import { type ReactNode, createContext, useContext } from "react";
import { useSettingsPaneFilter } from "./SettingsSearchContext";
import { rowMatches, sectionMatches, splitFirstMatch } from "./settingsSearchFilter";

interface SectionSearchScope {
	title?: string;
	matched: boolean;
}

const SectionSearchScopeContext = createContext<SectionSearchScope>({ matched: false });

export function useSectionSearchMatch(section: { title?: string; searchId?: string }) {
	const pane = useSettingsPaneFilter();
	return pane ? sectionMatches(pane, section) : false;
}

export function SectionSearchScopeProvider({
	title,
	matched,
	children,
}: SectionSearchScope & { children: ReactNode }) {
	return (
		<SectionSearchScopeContext.Provider value={{ title, matched }}>
			{children}
		</SectionSearchScopeContext.Provider>
	);
}

export function useSettingsRowHidden(row: {
	searchId?: string;
	title?: string;
	description?: string;
}) {
	const pane = useSettingsPaneFilter();
	const section = useContext(SectionSearchScopeContext);
	if (!pane || section.matched) return false;
	return !rowMatches(pane, { ...row, sectionTitle: section.title });
}

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
