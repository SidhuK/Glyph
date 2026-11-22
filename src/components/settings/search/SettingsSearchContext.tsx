import { type ReactNode, type RefObject, createContext, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUILayoutContext } from "../../../contexts";
import type { SettingsTab } from "../settingsConfig";
import { scrollToSettingsSearchEntry } from "../settingsSearch";
import { useActiveSettingsTab, useDeveloperMode } from "../useDeveloperMode";
import {
	type SettingsPaneFilter,
	type SettingsSearchFilter,
	buildSettingsSearchFilter,
	paneFilterFor,
} from "./settingsSearchFilter";

interface SettingsSearchContextValue {
	query: string;
	filter: SettingsSearchFilter | null;
	paneFilter: SettingsPaneFilter | null;
	inputRef: RefObject<HTMLInputElement | null>;
	changeQuery: (next: string) => void;
	clearQuery: () => void;
	revealFirstMatch: () => void;
}

const SettingsSearchContext = createContext<SettingsSearchContextValue | null>(null);

export function SettingsSearchProvider({
	inputRef,
	children,
}: {
	inputRef: RefObject<HTMLInputElement | null>;
	children: ReactNode;
}) {
	const { i18n } = useTranslation();
	const { setSettingsTab } = useUILayoutContext();
	const activeTab = useActiveSettingsTab();
	const { enabled: developerModeEnabled } = useDeveloperMode();
	const [query, setQuery] = useState("");

	const isTabVisible = (tab: SettingsTab) => tab !== "developer" || developerModeEnabled;
	const filterFor = (next: string) => buildSettingsSearchFilter(next, i18n.language, isTabVisible);
	const filter = filterFor(query);
	const paneFilter = paneFilterFor(filter, activeTab);

	const changeQuery = (next: string) => {
		setQuery(next);
		const nextFilter = filterFor(next);
		const firstMatch = nextFilter?.matches[0];
		if (firstMatch && !nextFilter.matchedTabs.has(activeTab)) {
			setSettingsTab(firstMatch.tab);
		}
	};

	const revealFirstMatch = () => {
		const firstMatch = filter?.matches[0];
		if (!firstMatch) return;
		setSettingsTab(firstMatch.tab);
		scrollToSettingsSearchEntry(firstMatch);
	};

	const value: SettingsSearchContextValue = {
		query,
		filter,
		paneFilter,
		inputRef,
		changeQuery,
		clearQuery: () => setQuery(""),
		revealFirstMatch,
	};

	return <SettingsSearchContext.Provider value={value}>{children}</SettingsSearchContext.Provider>;
}

export function useSettingsSearch(): SettingsSearchContextValue {
	const context = useContext(SettingsSearchContext);
	if (!context) throw new Error("useSettingsSearch must be used inside SettingsSearchProvider");
	return context;
}

export function useSettingsPaneFilter(): SettingsPaneFilter | null {
	return useContext(SettingsSearchContext)?.paneFilter ?? null;
}
