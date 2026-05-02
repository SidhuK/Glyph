import {
	clearMarkdownDocCache,
	setCachedMarkdownDoc,
} from "../components/preview/markdownCache";
import { buildMonthRange } from "./calendar";
import { readStoredSelectedViewId } from "./database/selectedViewStorage";
import { queryClient } from "./queryClient";
import type {
	AllDocsItem,
	CalendarRangeResponse,
	DatabaseRow,
	TextFileDoc,
	WorkspaceDatabaseDocument,
	WorkspaceDatabaseQueryResult,
	WorkspaceDatabaseSummary,
} from "./tauri";
import { invoke } from "./tauri";

const normalizeAllDocsFolder = (folderPrefix?: string | null) => {
	const normalized = folderPrefix
		?.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
	return normalized || "__all__";
};

export const navigationQueryKeys = {
	all: ["navigation"] as const,
	notes: () => [...navigationQueryKeys.all, "notes"] as const,
	note: (path: string) =>
		[...navigationQueryKeys.notes(), path.trim()] as const,
	calendar: () => [...navigationQueryKeys.all, "calendar"] as const,
	calendarRange: (args: {
		anchorDate: string;
		selectedDate: string;
		dailyNotesFolder: string | null;
	}) => {
		const range = buildMonthRange(args.anchorDate);
		return [
			...navigationQueryKeys.calendar(),
			range.start,
			range.end,
			args.selectedDate,
			args.dailyNotesFolder ?? "",
		] as const;
	},
	databases: () => [...navigationQueryKeys.all, "databases"] as const,
	databaseSummaries: () =>
		[...navigationQueryKeys.databases(), "summaries"] as const,
	databaseDocument: (databaseId: string) =>
		[
			...navigationQueryKeys.databases(),
			"document",
			databaseId.trim(),
		] as const,
	databaseRows: (databaseId: string, viewId: string) =>
		[
			...navigationQueryKeys.databases(),
			"rows",
			databaseId.trim(),
			viewId.trim(),
		] as const,
	allDocs: () => [...navigationQueryKeys.all, "all-docs"] as const,
	allDocsList: (folderPrefix?: string | null) =>
		[
			...navigationQueryKeys.allDocs(),
			normalizeAllDocsFolder(folderPrefix),
		] as const,
	taskSummaries: () => [...navigationQueryKeys.all, "task-summaries"] as const,
};

async function fetchNote(path: string): Promise<TextFileDoc> {
	const doc = await invoke("space_read_text", { path });
	setCachedMarkdownDoc(path, doc.text);
	return doc;
}

export function prefetchNote(path: string) {
	const normalized = path.trim();
	if (!normalized) return;
	void queryClient.prefetchQuery({
		queryKey: navigationQueryKeys.note(normalized),
		queryFn: () => fetchNote(normalized),
	});
}

export function getPrefetchedNote(path: string): TextFileDoc | null {
	return queryClient.getQueryData(navigationQueryKeys.note(path)) ?? null;
}

export function setPrefetchedNote(path: string, doc: TextFileDoc) {
	queryClient.setQueryData(navigationQueryKeys.note(path), doc);
	setCachedMarkdownDoc(path, doc.text);
}

export function invalidatePrefetchedNote(path?: string | null) {
	if (!path) {
		queryClient.removeQueries({ queryKey: navigationQueryKeys.notes() });
		return;
	}
	queryClient.removeQueries({ queryKey: navigationQueryKeys.note(path) });
}

export function loadCalendarData(args: {
	anchorDate: string;
	selectedDate: string;
	dailyNotesFolder: string | null;
}) {
	const range = buildMonthRange(args.anchorDate);
	return invoke("calendar_query_range", {
		start_date: range.start,
		end_date: range.end,
		selected_date: args.selectedDate,
		daily_notes_folder: args.dailyNotesFolder,
	});
}

export function prefetchCalendarData(args: {
	anchorDate: string;
	selectedDate: string;
	dailyNotesFolder: string | null;
}) {
	return queryClient.fetchQuery({
		queryKey: navigationQueryKeys.calendarRange(args),
		queryFn: () => loadCalendarData(args),
	});
}

export function getPrefetchedCalendarData(args: {
	anchorDate: string;
	selectedDate: string;
	dailyNotesFolder: string | null;
}) {
	return (
		queryClient.getQueryData<CalendarRangeResponse>(
			navigationQueryKeys.calendarRange(args),
		) ?? null
	);
}

export function invalidateCalendarPrefetch() {
	void queryClient.invalidateQueries({
		queryKey: navigationQueryKeys.calendar(),
	});
}

export function prefetchDatabaseSummaries() {
	return queryClient.fetchQuery({
		queryKey: navigationQueryKeys.databaseSummaries(),
		queryFn: () => invoke("databases_list"),
	});
}

export function getPrefetchedDatabaseSummaries() {
	return (
		queryClient.getQueryData<WorkspaceDatabaseSummary[]>(
			navigationQueryKeys.databaseSummaries(),
		) ?? null
	);
}

export function invalidateDatabaseSummariesPrefetch() {
	void queryClient.invalidateQueries({
		queryKey: navigationQueryKeys.databaseSummaries(),
	});
}

export function prefetchDatabaseDocument(databaseId: string) {
	const normalized = databaseId.trim();
	if (!normalized) {
		return Promise.reject(new Error("Database id is required."));
	}
	return queryClient.fetchQuery({
		queryKey: navigationQueryKeys.databaseDocument(normalized),
		queryFn: () => invoke("databases_get", { database_id: normalized }),
	});
}

export function getPrefetchedDatabaseDocument(databaseId: string) {
	return (
		queryClient.getQueryData<WorkspaceDatabaseDocument>(
			navigationQueryKeys.databaseDocument(databaseId),
		) ?? null
	);
}

export function setPrefetchedDatabaseDocument(
	databaseId: string,
	document: WorkspaceDatabaseDocument,
) {
	queryClient.setQueryData(
		navigationQueryKeys.databaseDocument(databaseId),
		document,
	);
}

async function loadAllDatabaseRows(
	databaseId: string,
	viewId: string,
): Promise<WorkspaceDatabaseQueryResult> {
	const maxIterations = 100;
	let offset = 0;
	let totalCount = 0;
	let truncated = false;
	let iterations = 0;
	const rows: DatabaseRow[] = [];
	let availableProperties =
		[] as WorkspaceDatabaseQueryResult["available_properties"];

	while (true) {
		const next = await invoke("databases_query_rows", {
			database_id: databaseId,
			view_id: viewId,
			offset,
			limit: 200,
		});
		rows.push(...next.rows);
		totalCount = next.total_count;
		truncated = next.truncated;
		if (next.available_properties.length > 0) {
			availableProperties = next.available_properties;
		}
		iterations += 1;
		if (next.next_offset == null) {
			return {
				rows,
				available_properties: availableProperties,
				total_count: totalCount,
				truncated,
				next_offset: null,
			};
		}
		if (iterations >= maxIterations) {
			return {
				rows,
				available_properties: availableProperties,
				total_count: totalCount,
				truncated: true,
				next_offset: next.next_offset,
			};
		}
		offset = next.next_offset;
	}
}

export function prefetchDatabaseRows(databaseId: string, viewId: string) {
	return queryClient.fetchQuery({
		queryKey: navigationQueryKeys.databaseRows(databaseId, viewId),
		queryFn: () => loadAllDatabaseRows(databaseId, viewId),
	});
}

export function getPrefetchedDatabaseRows(databaseId: string, viewId: string) {
	return (
		queryClient.getQueryData<WorkspaceDatabaseQueryResult>(
			navigationQueryKeys.databaseRows(databaseId, viewId),
		) ?? null
	);
}

export function setPrefetchedDatabaseRows(
	databaseId: string,
	viewId: string,
	rows: WorkspaceDatabaseQueryResult,
) {
	queryClient.setQueryData(
		navigationQueryKeys.databaseRows(databaseId, viewId),
		rows,
	);
}

export function invalidateDatabaseRowsPrefetch(databaseId?: string | null) {
	void queryClient.invalidateQueries({
		queryKey: databaseId
			? [...navigationQueryKeys.databases(), "rows", databaseId.trim()]
			: [...navigationQueryKeys.databases(), "rows"],
	});
}

export function invalidateDatabasePrefetch(databaseId?: string | null) {
	if (!databaseId) {
		void queryClient.invalidateQueries({
			queryKey: navigationQueryKeys.databases(),
		});
		return;
	}
	void queryClient.invalidateQueries({
		queryKey: navigationQueryKeys.databaseDocument(databaseId),
	});
	invalidateDatabaseRowsPrefetch(databaseId);
}

export async function prefetchDatabasesLanding(
	initialDatabaseId?: string | null,
) {
	const summaries = await prefetchDatabaseSummaries();
	const databaseId = initialDatabaseId ?? summaries[0]?.id ?? null;
	if (!databaseId) return;
	const document = await prefetchDatabaseDocument(databaseId);
	const viewIds = document.database.views.map((view) => view.id);
	const storedViewId = readStoredSelectedViewId(databaseId, viewIds);
	const preferredViewId =
		storedViewId ?? document.database.views[0]?.id ?? null;
	if (!preferredViewId) return;
	await prefetchDatabaseRows(databaseId, preferredViewId);
}

export async function loadAllDocs(folderPrefix?: string | null) {
	const normalized = normalizeAllDocsFolder(folderPrefix);
	const items = await invoke("all_docs_list", {
		limit: 2000,
		folder_prefix: folderPrefix?.trim() ? folderPrefix : null,
	});
	if (normalized === "__all__") return items;
	return items.filter((item) => {
		const normalizedPath = item.note_path
			.trim()
			.replace(/\\/g, "/")
			.replace(/^\/+/, "");
		return (
			normalizedPath === normalized ||
			normalizedPath.startsWith(`${normalized}/`)
		);
	});
}

export function prefetchAllDocs(folderPrefix?: string | null) {
	return queryClient.fetchQuery({
		queryKey: navigationQueryKeys.allDocsList(folderPrefix),
		queryFn: () => loadAllDocs(folderPrefix),
	});
}

export function getPrefetchedAllDocs(folderPrefix?: string | null) {
	return (
		queryClient.getQueryData<AllDocsItem[]>(
			navigationQueryKeys.allDocsList(folderPrefix),
		) ?? null
	);
}

export function invalidateAllDocsPrefetch(folderPrefix?: string | null) {
	void queryClient.invalidateQueries({
		queryKey:
			typeof folderPrefix === "string" || folderPrefix === null
				? navigationQueryKeys.allDocsList(folderPrefix)
				: navigationQueryKeys.allDocs(),
	});
}

export function invalidateNavigationPrefetch() {
	queryClient.removeQueries({ queryKey: navigationQueryKeys.all });
	clearMarkdownDocCache();
}
