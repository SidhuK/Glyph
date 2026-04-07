import { setCachedMarkdownDoc } from "../components/preview/markdownCache";
import { buildMonthRange } from "./calendar";
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

const NOTE_PREFETCH_DEBOUNCE_MS = 24;
const NOTE_PREFETCH_MAX_PATHS = 12;
const SPECIAL_DATA_CACHE_LIMIT = 8;
const DATABASE_SELECTED_VIEWS_STORAGE_KEY = "glyph.databases.selectedViews";

const prefetchedNoteDocs = new Map<string, TextFileDoc>();
const notePrefetchPromises = new Map<string, Promise<TextFileDoc | null>>();
const queuedNotePaths = new Set<string>();
let notePrefetchTimer: number | null = null;

const calendarDataCache = new Map<string, CalendarRangeResponse>();
const calendarPromiseCache = new Map<string, Promise<CalendarRangeResponse>>();

const databaseSummariesCache = {
	data: null as WorkspaceDatabaseSummary[] | null,
	promise: null as Promise<WorkspaceDatabaseSummary[]> | null,
};

const databaseDocumentCache = new Map<string, WorkspaceDatabaseDocument>();
const databaseDocumentPromiseCache = new Map<
	string,
	Promise<WorkspaceDatabaseDocument>
>();

const databaseRowsCache = new Map<string, WorkspaceDatabaseQueryResult>();
const databaseRowsPromiseCache = new Map<
	string,
	Promise<WorkspaceDatabaseQueryResult>
>();

const allDocsCache = new Map<string, AllDocsItem[]>();
const allDocsPromiseCache = new Map<string, Promise<AllDocsItem[]>>();

function trimCache<T>(
	cache: Map<string, T>,
	maxSize = SPECIAL_DATA_CACHE_LIMIT,
) {
	while (cache.size > maxSize) {
		const oldestKey = cache.keys().next().value;
		if (oldestKey === undefined) return;
		cache.delete(oldestKey);
	}
}

function scheduleQueuedNotePrefetch() {
	if (notePrefetchTimer !== null) return;
	notePrefetchTimer = window.setTimeout(() => {
		notePrefetchTimer = null;
		void flushQueuedNotePrefetch();
	}, NOTE_PREFETCH_DEBOUNCE_MS);
}

async function flushQueuedNotePrefetch() {
	const paths = [...queuedNotePaths].slice(0, NOTE_PREFETCH_MAX_PATHS);
	queuedNotePaths.clear();
	if (!paths.length) return;
	const missingPaths = paths.filter(
		(path) => !prefetchedNoteDocs.has(path) && !notePrefetchPromises.has(path),
	);
	if (!missingPaths.length) return;

	const batchPromise = invoke("space_read_texts_batch", {
		paths: missingPaths,
	});

	for (const path of missingPaths) {
		notePrefetchPromises.set(
			path,
			batchPromise
				.then((docs) => {
					const match = docs.find((entry) => entry.rel_path === path);
					if (
						!match ||
						match.error ||
						match.text === null ||
						match.etag === null
					) {
						return null;
					}
					const doc: TextFileDoc = {
						rel_path: match.rel_path,
						text: match.text,
						etag: match.etag,
						mtime_ms: match.mtime_ms,
					};
					prefetchedNoteDocs.set(path, doc);
					setCachedMarkdownDoc(path, doc.text);
					trimCache(prefetchedNoteDocs, NOTE_PREFETCH_MAX_PATHS);
					return doc;
				})
				.finally(() => {
					notePrefetchPromises.delete(path);
				}),
		);
	}
	try {
		await batchPromise;
	} catch {
		// Each per-path promise settles from the shared batch promise.
	}
}

function calendarCacheKey(args: {
	anchorDate: string;
	selectedDate: string;
	dailyNotesFolder: string | null;
}) {
	const range = buildMonthRange(args.anchorDate);
	return `${range.start}::${range.end}::${args.selectedDate}::${args.dailyNotesFolder ?? ""}`;
}

function databaseRowsCacheKey(databaseId: string, viewId: string) {
	return `${databaseId}::${viewId}`;
}

function allDocsCacheKey(folderPrefix?: string | null) {
	const normalized = folderPrefix
		?.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
	return normalized || "__all__";
}

function readStoredSelectedViewId(databaseId: string): string | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(
			DATABASE_SELECTED_VIEWS_STORAGE_KEY,
		);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		const candidate =
			parsed && typeof parsed === "object" ? parsed[databaseId] : null;
		return typeof candidate === "string" ? candidate : null;
	} catch {
		return null;
	}
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

export function prefetchNote(path: string) {
	const normalized = path.trim();
	if (!normalized || prefetchedNoteDocs.has(normalized)) return;
	queuedNotePaths.add(normalized);
	scheduleQueuedNotePrefetch();
}

export function getPrefetchedNote(path: string): TextFileDoc | null {
	return prefetchedNoteDocs.get(path) ?? null;
}

export function setPrefetchedNote(path: string, doc: TextFileDoc) {
	prefetchedNoteDocs.set(path, doc);
	trimCache(prefetchedNoteDocs, NOTE_PREFETCH_MAX_PATHS);
	notePrefetchPromises.delete(path);
	setCachedMarkdownDoc(path, doc.text);
}

export function invalidatePrefetchedNote(path?: string | null) {
	if (!path) {
		prefetchedNoteDocs.clear();
		notePrefetchPromises.clear();
		queuedNotePaths.clear();
		return;
	}
	prefetchedNoteDocs.delete(path);
	notePrefetchPromises.delete(path);
	queuedNotePaths.delete(path);
}

export function prefetchCalendarData(args: {
	anchorDate: string;
	selectedDate: string;
	dailyNotesFolder: string | null;
}) {
	const key = calendarCacheKey(args);
	const cached = calendarDataCache.get(key);
	if (cached) return Promise.resolve(cached);
	const existingPromise = calendarPromiseCache.get(key);
	if (existingPromise) return existingPromise;

	const range = buildMonthRange(args.anchorDate);
	const promise = invoke("calendar_query_range", {
		start_date: range.start,
		end_date: range.end,
		selected_date: args.selectedDate,
		daily_notes_folder: args.dailyNotesFolder,
	})
		.then((result) => {
			calendarDataCache.set(key, result);
			trimCache(calendarDataCache);
			return result;
		})
		.finally(() => {
			calendarPromiseCache.delete(key);
		});

	calendarPromiseCache.set(key, promise);
	return promise;
}

export function getPrefetchedCalendarData(args: {
	anchorDate: string;
	selectedDate: string;
	dailyNotesFolder: string | null;
}) {
	return calendarDataCache.get(calendarCacheKey(args)) ?? null;
}

export function invalidateCalendarPrefetch() {
	calendarDataCache.clear();
	calendarPromiseCache.clear();
}

export function prefetchDatabaseSummaries() {
	if (databaseSummariesCache.data) {
		return Promise.resolve(databaseSummariesCache.data);
	}
	if (databaseSummariesCache.promise) {
		return databaseSummariesCache.promise;
	}
	const promise = invoke("databases_list")
		.then((result) => {
			databaseSummariesCache.data = result;
			return result;
		})
		.finally(() => {
			databaseSummariesCache.promise = null;
		});
	databaseSummariesCache.promise = promise;
	return promise;
}

export function getPrefetchedDatabaseSummaries() {
	return databaseSummariesCache.data;
}

export function invalidateDatabaseSummariesPrefetch() {
	databaseSummariesCache.data = null;
	databaseSummariesCache.promise = null;
}

export function prefetchDatabaseDocument(databaseId: string) {
	const normalized = databaseId.trim();
	if (!normalized) {
		return Promise.reject(new Error("Database id is required."));
	}
	const cached = databaseDocumentCache.get(normalized);
	if (cached) return Promise.resolve(cached);
	const existingPromise = databaseDocumentPromiseCache.get(normalized);
	if (existingPromise) return existingPromise;
	const promise = invoke("databases_get", { database_id: normalized })
		.then((result) => {
			databaseDocumentCache.set(normalized, result);
			trimCache(databaseDocumentCache);
			return result;
		})
		.finally(() => {
			databaseDocumentPromiseCache.delete(normalized);
		});
	databaseDocumentPromiseCache.set(normalized, promise);
	return promise;
}

export function getPrefetchedDatabaseDocument(databaseId: string) {
	return databaseDocumentCache.get(databaseId) ?? null;
}

export function setPrefetchedDatabaseDocument(
	databaseId: string,
	document: WorkspaceDatabaseDocument,
) {
	databaseDocumentCache.set(databaseId, document);
	trimCache(databaseDocumentCache);
	databaseDocumentPromiseCache.delete(databaseId);
}

export function prefetchDatabaseRows(databaseId: string, viewId: string) {
	const key = databaseRowsCacheKey(databaseId, viewId);
	const cached = databaseRowsCache.get(key);
	if (cached) return Promise.resolve(cached);
	const existingPromise = databaseRowsPromiseCache.get(key);
	if (existingPromise) return existingPromise;
	const promise = loadAllDatabaseRows(databaseId, viewId)
		.then((result) => {
			databaseRowsCache.set(key, result);
			trimCache(databaseRowsCache);
			return result;
		})
		.finally(() => {
			databaseRowsPromiseCache.delete(key);
		});
	databaseRowsPromiseCache.set(key, promise);
	return promise;
}

export function getPrefetchedDatabaseRows(databaseId: string, viewId: string) {
	return (
		databaseRowsCache.get(databaseRowsCacheKey(databaseId, viewId)) ?? null
	);
}

export function setPrefetchedDatabaseRows(
	databaseId: string,
	viewId: string,
	rows: WorkspaceDatabaseQueryResult,
) {
	databaseRowsCache.set(databaseRowsCacheKey(databaseId, viewId), rows);
	trimCache(databaseRowsCache);
	databaseRowsPromiseCache.delete(databaseRowsCacheKey(databaseId, viewId));
}

export function invalidateDatabasePrefetch(databaseId?: string | null) {
	if (!databaseId) {
		databaseDocumentCache.clear();
		databaseDocumentPromiseCache.clear();
		databaseRowsCache.clear();
		databaseRowsPromiseCache.clear();
		return;
	}
	databaseDocumentCache.delete(databaseId);
	databaseDocumentPromiseCache.delete(databaseId);
	for (const key of [...databaseRowsCache.keys()]) {
		if (key.startsWith(`${databaseId}::`)) {
			databaseRowsCache.delete(key);
		}
	}
	for (const key of [...databaseRowsPromiseCache.keys()]) {
		if (key.startsWith(`${databaseId}::`)) {
			databaseRowsPromiseCache.delete(key);
		}
	}
}

export async function prefetchDatabasesLanding(
	initialDatabaseId?: string | null,
) {
	const summaries = await prefetchDatabaseSummaries();
	const databaseId = initialDatabaseId ?? summaries[0]?.id ?? null;
	if (!databaseId) return;
	const document = await prefetchDatabaseDocument(databaseId);
	const storedViewId = readStoredSelectedViewId(databaseId);
	const preferredViewId =
		(storedViewId &&
		document.database.views.some((view) => view.id === storedViewId)
			? storedViewId
			: null) ??
		document.database.views[0]?.id ??
		null;
	if (!preferredViewId) return;
	await prefetchDatabaseRows(databaseId, preferredViewId);
}

export function prefetchAllDocs(folderPrefix?: string | null) {
	const key = allDocsCacheKey(folderPrefix);
	const cached = allDocsCache.get(key);
	if (cached) return Promise.resolve(cached);
	const existingPromise = allDocsPromiseCache.get(key);
	if (existingPromise) return existingPromise;
	const promise = invoke("all_docs_list", {
		limit: 2000,
		folder_prefix: folderPrefix?.trim() ? folderPrefix : null,
	})
		.then((items) => {
			const normalized = allDocsCacheKey(folderPrefix);
			const nextItems =
				normalized === "__all__"
					? items
					: items.filter((item) => {
							const normalizedPath = item.note_path
								.trim()
								.replace(/\\/g, "/")
								.replace(/^\/+/, "");
							return (
								normalizedPath === normalized ||
								normalizedPath.startsWith(`${normalized}/`)
							);
						});
			allDocsCache.set(key, nextItems);
			trimCache(allDocsCache);
			return nextItems;
		})
		.finally(() => {
			allDocsPromiseCache.delete(key);
		});
	allDocsPromiseCache.set(key, promise);
	return promise;
}

export function getPrefetchedAllDocs(folderPrefix?: string | null) {
	return allDocsCache.get(allDocsCacheKey(folderPrefix)) ?? null;
}

export function invalidateAllDocsPrefetch(folderPrefix?: string | null) {
	if (typeof folderPrefix === "string" || folderPrefix === null) {
		const key = allDocsCacheKey(folderPrefix);
		allDocsCache.delete(key);
		allDocsPromiseCache.delete(key);
		return;
	}
	allDocsCache.clear();
	allDocsPromiseCache.clear();
}
