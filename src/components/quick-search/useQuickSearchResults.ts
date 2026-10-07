import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { databaseSummariesQueryOptions } from "../../lib/navigationPrefetch";
import { loadSettings } from "../../lib/settings";
import { invoke } from "../../lib/tauri";
import { parsePaletteQuery } from "../app/commandPaletteHelpers";
import { buildPaletteResults } from "../app/paletteResults";
import { useCommandSearch } from "../app/useCommandSearch";

const TAG_RESULT_LIMIT = 8;

export function useQuickSearchResults(query: string, spacePath: string) {
	const { t, i18n } = useTranslation("shell");
	const parsedQuery = parsePaletteQuery(query);
	const referenceScope = parsedQuery.scope === "tags" || parsedQuery.scope === "people";
	const searchEnabled = parsedQuery.scope === "all" || referenceScope;
	const tagQuery = parsedQuery.text.trim();

	const settings = useQuery({
		queryKey: ["quick-search", "settings"],
		queryFn: () => loadSettings(),
	});
	const { recentFiles, isSearching, searchError, titleMatches, contentMatches } = useCommandSearch(
		referenceScope ? parsedQuery.raw : parsedQuery.text,
		spacePath,
		searchEnabled,
		settings.data?.editor.enablePeopleMentionsAsTags ?? false,
	);
	const tags = useQuery({
		queryKey: ["quick-search", "tags", spacePath, tagQuery],
		queryFn: () => invoke("tags_list", { query: tagQuery, limit: TAG_RESULT_LIMIT }),
		enabled: Boolean(tagQuery) && (parsedQuery.scope === "all" || parsedQuery.scope === "tags"),
		placeholderData: keepPreviousData,
	});
	const databases = useQuery(databaseSummariesQueryOptions());

	const results = buildPaletteResults({
		query,
		mode: "search",
		spacePath,
		templateFolder: null,
		language: i18n.language,
		t,
		sources: {
			commands: [],
			settings: undefined,
			settingValue: () => null,
			tabs: [],
			titleMatches,
			contentMatches,
			recentFiles,
			folders: [],
			tags: tagQuery ? (tags.data ?? []) : [],
			people: [],
			databases: databases.data ?? [],
			templates: [],
		},
	});

	return {
		results,
		isSearching: isSearching || tags.isFetching,
		error: searchError ?? tags.error ?? databases.error ?? settings.error,
	};
}
