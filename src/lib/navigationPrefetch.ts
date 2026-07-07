import {
	clearMarkdownDocCache,
	setCachedMarkdownDoc,
} from "../components/preview/markdownCache";
import { summarizeChecklistsFromMarkdown } from "./checklistSummary";
import {
	readStoredSelectedDatabaseId,
	resolveSelectedDatabaseId,
} from "./database/selectedViewStorage";
import { parseNotePreview } from "./notePreview";
import { queryClient } from "./queryClient";
import type {
	AllDocsItem,
	NoteTaskSummary,
	TextFileDoc,
	WorkspaceDatabaseDocument,
	WorkspaceDatabaseSummary,
} from "./tauri";
import { invoke } from "./tauri";

const NOTE_PREFETCH_GC_TIME_MS = 60 * 1000;
const NAVIGATION_STALE_TIME_MS = 5 * 60 * 1000;

const normalizeAllDocsFolder = (folderPrefix?: string | null) => {
	const normalized = folderPrefix
		?.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
	return normalized || "__all__";
};

const normalizeAllDocsPath = (path: string) =>
	path
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");

const titleFromAllDocsPath = (path: string) => {
	const name = normalizeAllDocsPath(path).split("/").pop() ?? "Untitled";
	return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
};

const allDocsFolderContainsPath = (folderKey: string, path: string) => {
	if (folderKey === "__all__") return true;
	const normalizedPath = normalizeAllDocsPath(path);
	return (
		normalizedPath === folderKey || normalizedPath.startsWith(`${folderKey}/`)
	);
};

const compareAllDocsItems = (left: AllDocsItem, right: AllDocsItem) =>
	Date.parse(right.updated) - Date.parse(left.updated) ||
	left.note_path.localeCompare(right.note_path);

type TaskSummaryCache = Record<string, NoteTaskSummary>;

export const navigationQueryKeys = {
	all: ["navigation"] as const,
	notes: () => [...navigationQueryKeys.all, "notes"] as const,
	note: (path: string) =>
		[...navigationQueryKeys.notes(), path.trim()] as const,
	databases: () => [...navigationQueryKeys.all, "databases"] as const,
	databaseSummaries: () =>
		[...navigationQueryKeys.databases(), "summaries"] as const,
	databaseDocument: (databaseId: string) =>
		[
			...navigationQueryKeys.databases(),
			"document",
			databaseId.trim(),
		] as const,
	databaseRowsPages: (databaseId: string, viewId: string, pageSize: number) =>
		[
			...navigationQueryKeys.databases(),
			"rows-pages",
			databaseId.trim(),
			viewId.trim(),
			pageSize,
		] as const,
	allDocs: () => [...navigationQueryKeys.all, "all-docs"] as const,
	allDocsList: (folderPrefix?: string | null) =>
		[
			...navigationQueryKeys.allDocs(),
			normalizeAllDocsFolder(folderPrefix),
		] as const,
	allDocsPages: (folderPrefix?: string | null, pageSize = ALL_DOCS_PAGE_SIZE) =>
		[
			...navigationQueryKeys.allDocs(),
			"pages",
			normalizeAllDocsFolder(folderPrefix),
			pageSize,
		] as const,
	allDocsCount: (folderPrefix?: string | null) =>
		[
			...navigationQueryKeys.allDocs(),
			"count",
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
		gcTime: NOTE_PREFETCH_GC_TIME_MS,
		staleTime: NAVIGATION_STALE_TIME_MS,
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

export function prefetchDatabaseSummaries() {
	return queryClient.fetchQuery({
		queryKey: navigationQueryKeys.databaseSummaries(),
		queryFn: () => invoke("databases_list"),
		staleTime: NAVIGATION_STALE_TIME_MS,
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
		staleTime: NAVIGATION_STALE_TIME_MS,
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

export function invalidateDatabaseRowsPrefetch(databaseId?: string | null) {
	void queryClient.invalidateQueries({
		queryKey: databaseId
			? [...navigationQueryKeys.databases(), "rows-pages", databaseId.trim()]
			: [...navigationQueryKeys.databases(), "rows-pages"],
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
	const storedId = readStoredSelectedDatabaseId();
	const candidateId = initialDatabaseId ?? storedId;
	const summariesPromise = prefetchDatabaseSummaries();
	const candidateDocumentPromise = candidateId
		? prefetchDatabaseDocument(candidateId).catch(() => null)
		: null;
	const summaries = await summariesPromise;
	const databaseId = resolveSelectedDatabaseId(summaries, {
		current: null,
		openRequestId: initialDatabaseId ?? null,
		storedId,
	});
	if (!databaseId) return;
	if (databaseId === candidateId && candidateDocumentPromise) {
		const document = await candidateDocumentPromise;
		if (document) return;
	}
	await prefetchDatabaseDocument(databaseId);
}

export const ALL_DOCS_LIST_LIMIT = 2000;
export const ALL_DOCS_PAGE_SIZE = 48;
export const ACTIVITY_DOCS_PAGE_SIZE = 40;

export function formatAllDocsCountLabel(count: number): string | null {
	if (count <= 0) return null;
	if (count > ALL_DOCS_LIST_LIMIT) return `${ALL_DOCS_LIST_LIMIT}+`;
	return String(count);
}

export async function loadAllDocsCount(folderPrefix?: string | null) {
	return invoke("all_docs_count", {
		folder_prefix: folderPrefix?.trim() ? folderPrefix : null,
	});
}

export interface AllDocsPage {
	items: AllDocsItem[];
	nextOffset: number | null;
}

interface AllDocsPagesData {
	pages: AllDocsPage[];
	pageParams: unknown[];
}

export async function loadAllDocsPage(
	folderPrefix?: string | null,
	offset = 0,
	limit = ALL_DOCS_PAGE_SIZE,
): Promise<AllDocsPage> {
	const items = await invoke("all_docs_list", {
		limit: limit + 1,
		offset,
		folder_prefix: folderPrefix?.trim() ? folderPrefix : null,
	});
	const pageItems = items.slice(0, limit);
	return {
		items: pageItems,
		nextOffset: items.length > limit ? offset + pageItems.length : null,
	};
}

export async function loadAllDocs(folderPrefix?: string | null) {
	const pages: AllDocsItem[] = [];
	let offset = 0;
	while (pages.length < ALL_DOCS_LIST_LIMIT) {
		const next = await loadAllDocsPage(
			folderPrefix,
			offset,
			Math.min(ALL_DOCS_PAGE_SIZE, ALL_DOCS_LIST_LIMIT - pages.length),
		);
		pages.push(...next.items);
		if (next.nextOffset == null) break;
		offset = next.nextOffset;
	}
	return pages;
}

export function allDocsPagesQueryOptions(
	folderPrefix?: string | null,
	pageSize = ALL_DOCS_PAGE_SIZE,
) {
	return {
		queryKey: navigationQueryKeys.allDocsPages(folderPrefix, pageSize),
		queryFn: ({ pageParam }: { pageParam: unknown }) => {
			const offset = typeof pageParam === "number" ? pageParam : 0;
			return loadAllDocsPage(folderPrefix, offset, pageSize);
		},
		initialPageParam: 0,
		getNextPageParam: (lastPage: AllDocsPage) =>
			lastPage.nextOffset ?? undefined,
		staleTime: NAVIGATION_STALE_TIME_MS,
	};
}

export function allDocsListQueryOptions(folderPrefix?: string | null) {
	return {
		queryKey: navigationQueryKeys.allDocsList(folderPrefix),
		queryFn: () => loadAllDocs(folderPrefix),
		staleTime: NAVIGATION_STALE_TIME_MS,
	};
}

export function allDocsCountQueryOptions(folderPrefix?: string | null) {
	return {
		queryKey: navigationQueryKeys.allDocsCount(folderPrefix),
		queryFn: () => loadAllDocsCount(folderPrefix),
		staleTime: NAVIGATION_STALE_TIME_MS,
	};
}

export function prefetchAllDocs(
	folderPrefix?: string | null,
	pageSize = ALL_DOCS_PAGE_SIZE,
) {
	return queryClient.prefetchInfiniteQuery(
		allDocsPagesQueryOptions(folderPrefix, pageSize),
	);
}

export function prefetchAllDocsList(folderPrefix?: string | null) {
	return queryClient.prefetchQuery(allDocsListQueryOptions(folderPrefix));
}

export function getPrefetchedAllDocs(
	folderPrefix?: string | null,
	pageSize = ALL_DOCS_PAGE_SIZE,
) {
	const pages = queryClient.getQueryData<AllDocsPagesData>(
		navigationQueryKeys.allDocsPages(folderPrefix, pageSize),
	);
	if (pages) return pages.pages.flatMap((page) => page.items);
	return (
		queryClient.getQueryData<AllDocsItem[]>(
			navigationQueryKeys.allDocsList(folderPrefix),
		) ?? null
	);
}

function rebuildAllDocsPages(
	current: AllDocsPagesData,
	items: AllDocsItem[],
	pageSize: number,
): AllDocsPagesData {
	if (current.pages.length === 0 && items.length === 0) {
		return {
			pages: [{ items, nextOffset: null }],
			pageParams: [0],
		};
	}
	const hadMore = current.pages[current.pages.length - 1]?.nextOffset != null;
	const pages: AllDocsPage[] = [];
	for (let offset = 0; offset < items.length; offset += pageSize) {
		const pageItems = items.slice(offset, offset + pageSize);
		const hasLocalNext = offset + pageSize < items.length;
		pages.push({
			items: pageItems,
			nextOffset: hasLocalNext || hadMore ? offset + pageItems.length : null,
		});
	}
	if (pages.length === 0) {
		return {
			pages: [{ items: [], nextOffset: hadMore ? 0 : null }],
			pageParams: [0],
		};
	}
	return {
		pages,
		pageParams: pages.map((_, index) => index * pageSize),
	};
}

function updateAllDocsCountCaches(
	updater: (current: number, folderKey: string) => number,
) {
	const queries = queryClient
		.getQueryCache()
		.findAll({ queryKey: [...navigationQueryKeys.allDocs(), "count"] });
	for (const query of queries) {
		if (!Array.isArray(query.queryKey) || query.queryKey.length !== 4) {
			continue;
		}
		const folderKey = normalizeAllDocsFolder(String(query.queryKey[3] ?? ""));
		const current = queryClient.getQueryData<number>(query.queryKey);
		if (current === undefined) continue;
		queryClient.setQueryData<number>(
			query.queryKey,
			updater(current, folderKey),
		);
	}
}

function adjustAllDocsCount(path: string, delta: number) {
	const normalizedPath = normalizeAllDocsPath(path);
	if (!normalizedPath.toLowerCase().endsWith(".md")) return;
	updateAllDocsCountCaches((current, folderKey) => {
		if (!allDocsFolderContainsPath(folderKey, normalizedPath)) return current;
		return Math.max(0, current + delta);
	});
}

function updateAllDocsCaches(
	updater: (current: AllDocsItem[], folderKey: string) => AllDocsItem[],
) {
	const queries = queryClient
		.getQueryCache()
		.findAll({ queryKey: navigationQueryKeys.allDocs() });
	for (const query of queries) {
		if (!Array.isArray(query.queryKey)) {
			continue;
		}
		if (query.queryKey.length === 3) {
			const folderKey = normalizeAllDocsFolder(String(query.queryKey[2] ?? ""));
			const current = queryClient.getQueryData<AllDocsItem[]>(query.queryKey);
			if (!current) continue;
			queryClient.setQueryData<AllDocsItem[]>(
				query.queryKey,
				updater(current, folderKey),
			);
			continue;
		}
		if (query.queryKey.length !== 5 || query.queryKey[2] !== "pages") {
			continue;
		}
		const folderKey = normalizeAllDocsFolder(String(query.queryKey[3] ?? ""));
		const rawPageSize = query.queryKey[4];
		const pageSize =
			typeof rawPageSize === "number" && rawPageSize > 0
				? rawPageSize
				: ALL_DOCS_PAGE_SIZE;
		const current = queryClient.getQueryData<AllDocsPagesData>(query.queryKey);
		if (!current) continue;
		const nextItems = updater(
			current.pages.flatMap((page) => page.items),
			folderKey,
		);
		queryClient.setQueryData<AllDocsPagesData>(
			query.queryKey,
			rebuildAllDocsPages(current, nextItems, pageSize),
		);
	}
}

function findCachedAllDocsItem(path: string): AllDocsItem | null {
	const normalizedPath = normalizeAllDocsPath(path);
	const queries = queryClient
		.getQueryCache()
		.findAll({ queryKey: navigationQueryKeys.allDocs() });
	for (const query of queries) {
		if (!Array.isArray(query.queryKey)) {
			continue;
		}
		const current =
			query.queryKey.length === 3
				? queryClient.getQueryData<AllDocsItem[]>(query.queryKey)
				: query.queryKey.length === 5 && query.queryKey[2] === "pages"
					? queryClient
							.getQueryData<AllDocsPagesData>(query.queryKey)
							?.pages.flatMap((page) => page.items)
					: null;
		const item = current?.find(
			(note) => normalizeAllDocsPath(note.note_path) === normalizedPath,
		);
		if (item) return item;
	}
	return null;
}

function upsertAllDocsPrefetchItem(item: AllDocsItem) {
	const normalizedPath = normalizeAllDocsPath(item.note_path);
	if (!normalizedPath) return;
	updateAllDocsCaches((current, folderKey) => {
		const withoutItem = current.filter(
			(note) => normalizeAllDocsPath(note.note_path) !== normalizedPath,
		);
		if (!allDocsFolderContainsPath(folderKey, normalizedPath))
			return withoutItem;
		return [...withoutItem, { ...item, note_path: normalizedPath }].sort(
			compareAllDocsItems,
		);
	});
}

export function optimisticallyAddAllDocsNote(args: {
	path: string;
	text?: string;
	sourcePath?: string;
}) {
	const normalizedPath = normalizeAllDocsPath(args.path);
	if (!normalizedPath.toLowerCase().endsWith(".md")) return;
	const source = args.sourcePath
		? findCachedAllDocsItem(args.sourcePath)
		: null;
	const preview = parseNotePreview(normalizedPath, args.text ?? "");
	const now = new Date().toISOString();
	const alreadyCached = findCachedAllDocsItem(normalizedPath) !== null;
	upsertAllDocsPrefetchItem({
		note_path: normalizedPath,
		title:
			source?.title ??
			(args.text !== undefined
				? preview.title
				: titleFromAllDocsPath(normalizedPath)),
		preview:
			source?.preview ?? (args.text !== undefined ? preview.content : ""),
		updated: now,
		created: now,
		tags: source?.tags ?? [],
		people: source?.people ?? [],
	});
	if (!alreadyCached) {
		adjustAllDocsCount(normalizedPath, 1);
	}
}

export function optimisticallyRenameAllDocsPath(
	fromPath: string,
	toPath: string,
	recursive = false,
) {
	const from = normalizeAllDocsPath(fromPath);
	const to = normalizeAllDocsPath(toPath);
	if (!from || !to) return;
	const fromTitle = titleFromAllDocsPath(from);
	const toTitle = titleFromAllDocsPath(to);
	updateAllDocsCaches((current, folderKey) => {
		const next: AllDocsItem[] = [];
		for (const note of current) {
			const notePath = normalizeAllDocsPath(note.note_path);
			const matches =
				notePath === from || (recursive && notePath.startsWith(`${from}/`));
			const renamedPath = matches
				? notePath === from
					? to
					: `${to}${notePath.slice(from.length)}`
				: notePath;
			if (!allDocsFolderContainsPath(folderKey, renamedPath)) continue;
			next.push(
				matches
					? {
							...note,
							note_path: renamedPath,
							title: note.title === fromTitle ? toTitle : note.title,
						}
					: note,
			);
		}
		return next.sort(compareAllDocsItems);
	});
}

export function optimisticallyRemoveAllDocsPath(
	path: string,
	recursive = false,
) {
	const normalizedPath = normalizeAllDocsPath(path);
	if (!normalizedPath) return;
	const removedMarkdownPaths = new Set<string>();
	if (!recursive && normalizedPath.toLowerCase().endsWith(".md")) {
		removedMarkdownPaths.add(normalizedPath);
	}
	updateAllDocsCaches((current) =>
		current.filter((note) => {
			const notePath = normalizeAllDocsPath(note.note_path);
			const shouldRemove =
				notePath === normalizedPath ||
				(recursive && notePath.startsWith(`${normalizedPath}/`));
			if (shouldRemove && notePath.toLowerCase().endsWith(".md")) {
				removedMarkdownPaths.add(notePath);
			}
			return !shouldRemove;
		}),
	);
	for (const removedPath of removedMarkdownPaths) {
		adjustAllDocsCount(removedPath, -1);
	}
}

export function invalidateAllDocsPrefetch(folderPrefix?: string | null) {
	if (typeof folderPrefix === "string" || folderPrefix === null) {
		void queryClient.invalidateQueries({
			queryKey: navigationQueryKeys.allDocsList(folderPrefix),
		});
		void queryClient.invalidateQueries({
			queryKey: [
				...navigationQueryKeys.allDocs(),
				"pages",
				normalizeAllDocsFolder(folderPrefix),
			],
		});
		return;
	}
	void queryClient.invalidateQueries({
		queryKey: navigationQueryKeys.allDocs(),
	});
}

export function invalidateTaskSummariesPrefetch() {
	void queryClient.invalidateQueries({
		queryKey: navigationQueryKeys.taskSummaries(),
	});
}

function cachedTaskSummaryForPath(path: string): NoteTaskSummary | undefined {
	const summaries = queryClient.getQueriesData<TaskSummaryCache>({
		queryKey: navigationQueryKeys.taskSummaries(),
	});
	for (const [, data] of summaries) {
		const summary = data?.[path];
		if (summary) return summary;
	}
	return undefined;
}

function taskSummariesEqual(left: NoteTaskSummary, right: NoteTaskSummary) {
	return (
		left?.total_count === right.total_count &&
		left.completed_count === right.completed_count &&
		left.open_count === right.open_count
	);
}

export async function invalidateTaskSummariesPrefetchForNote(
	path: string,
	options: { removed?: boolean } = {},
) {
	const normalizedPath = normalizeAllDocsPath(path);
	if (!normalizedPath) return;

	const cachedSummary = cachedTaskSummaryForPath(normalizedPath);
	if (options.removed) {
		if (cachedSummary) invalidateTaskSummariesPrefetch();
		return;
	}

	try {
		const doc = await invoke("space_read_text", { path: normalizedPath });
		const nextSummary = summarizeChecklistsFromMarkdown(doc.text);
		const shouldInvalidate = cachedSummary
			? !taskSummariesEqual(cachedSummary, nextSummary)
			: nextSummary.total_count > 0;
		if (shouldInvalidate) {
			invalidateTaskSummariesPrefetch();
		}
	} catch {
		if (cachedSummary) invalidateTaskSummariesPrefetch();
	}
}

export function invalidateNavigationPrefetch() {
	queryClient.removeQueries({ queryKey: navigationQueryKeys.all });
	clearMarkdownDocCache();
}
