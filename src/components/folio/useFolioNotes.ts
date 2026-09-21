import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import type { AllDocsPage } from "../../lib/navigationPrefetch";
import { loadSettings } from "../../lib/settings";
import type { FileTreeSortMode } from "../../lib/settings/model";
import type { AllDocsItem, FsEntry } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { basename, displayNameFromPath, normalizeRelPath } from "../../utils/path";
import type { FolioScope } from "./folioScopes";

export interface FolioItem extends Omit<AllDocsItem, "created" | "updated"> {
	created: string | null;
	updated: string | null;
	is_markdown: boolean;
}

const FOLIO_NOTES_PAGE_SIZE = 200;
const FOLIO_NON_MARKDOWN_FILE_LIMIT = 5_000;
const FILE_VISIBILITY_QUERY_KEY = ["settings", "folio-file-visibility"] as const;

function scopeQueryKey(scope: FolioScope): readonly string[] {
	switch (scope.kind) {
		case "folder":
			return ["folder", normalizeRelPath(scope.folderPrefix)];
		case "tag":
			return ["tag", scope.tag.trim()];
		case "person":
			return ["person", scope.handle.trim()];
		default:
			return ["all"];
	}
}

function scopeInvokeArgs(scope: FolioScope) {
	switch (scope.kind) {
		case "folder":
			return { folder_prefix: normalizeRelPath(scope.folderPrefix) || null };
		case "tag":
			return { tag: scope.tag };
		case "person":
			return { person: scope.handle };
		default:
			return {};
	}
}

function fileEntryToFolioItem(entry: FsEntry): FolioItem {
	return {
		note_path: normalizeRelPath(entry.rel_path),
		title: entry.is_markdown ? displayNameFromPath(entry.rel_path) : basename(entry.rel_path),
		preview: "",
		updated: entry.updated ?? null,
		created: entry.created ?? null,
		tags: [],
		people: [],
		is_markdown: entry.is_markdown,
	};
}

async function listNonMarkdownFiles(folderPrefix: string | null) {
	const result = await invoke("space_list_non_markdown_files", {
		dir: folderPrefix,
		limit: FOLIO_NON_MARKDOWN_FILE_LIMIT,
	});
	return {
		files: result.files.map(fileEntryToFolioItem),
		truncated: result.truncated,
	};
}

async function listNotesPage(
	scope: FolioScope,
	sortMode: FileTreeSortMode,
	query: string,
	pinnedPaths: string[],
	offset: number,
): Promise<AllDocsPage> {
	const items = await invoke("all_docs_list", {
		...scopeInvokeArgs(scope),
		limit: FOLIO_NOTES_PAGE_SIZE + 1,
		offset,
		sort_mode: sortMode,
		query: query.trim() || null,
		pinned_paths: pinnedPaths,
	});
	const pageItems = items.slice(0, FOLIO_NOTES_PAGE_SIZE);
	return {
		items: pageItems,
		nextOffset: items.length > FOLIO_NOTES_PAGE_SIZE ? offset + pageItems.length : null,
	};
}

function fileMatchesQuery(file: FolioItem, query: string): boolean {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	if (!normalizedQuery) return true;
	return `${file.title} ${file.note_path}`.toLocaleLowerCase().includes(normalizedQuery);
}

function mergeFolioItems(notes: AllDocsItem[], files: FolioItem[], query: string) {
	const itemsByPath = new Map<string, FolioItem>();
	for (const note of notes) {
		const path = normalizeRelPath(note.note_path);
		if (!path) continue;
		itemsByPath.set(path, { ...note, note_path: path, is_markdown: true });
	}
	for (const file of files) {
		if (!file.note_path || itemsByPath.has(file.note_path) || !fileMatchesQuery(file, query))
			continue;
		itemsByPath.set(file.note_path, file);
	}
	return Array.from(itemsByPath.values());
}

export function useFolioNotes(
	scope: FolioScope,
	sortMode: FileTreeSortMode,
	query: string,
	pinnedPaths: string[],
) {
	const queryClient = useQueryClient();
	const visibilityRevisionRef = useRef(0);
	const latestVisibilityRef = useRef<boolean | null>(null);
	const folderPrefix =
		scope.kind === "folder" ? normalizeRelPath(scope.folderPrefix) || null : null;
	const visibilityQuery = useQuery({
		queryKey: FILE_VISIBILITY_QUERY_KEY,
		queryFn: async () => {
			const revision = visibilityRevisionRef.current;
			try {
				const loaded = (await loadSettings()).ui.showNonMarkdownFiles;
				return revision === visibilityRevisionRef.current
					? loaded
					: (latestVisibilityRef.current ?? loaded);
			} catch {
				return latestVisibilityRef.current ?? true;
			}
		},
	});
	const includesNonMarkdownFiles =
		visibilityQuery.data === true && scope.kind !== "tag" && scope.kind !== "person";

	useTauriEvent("settings:updated", (payload) => {
		if (typeof payload.ui?.showNonMarkdownFiles === "boolean") {
			const nextVisibility = payload.ui.showNonMarkdownFiles;
			visibilityRevisionRef.current += 1;
			latestVisibilityRef.current = nextVisibility;
			queryClient.setQueryData(FILE_VISIBILITY_QUERY_KEY, nextVisibility);
		}
	});

	const notesQuery = useInfiniteQuery({
		queryKey: [
			"navigation",
			"all-docs",
			"folio",
			...scopeQueryKey(scope),
			sortMode,
			query.trim(),
			pinnedPaths,
		],
		queryFn: ({ pageParam }) => listNotesPage(scope, sortMode, query, pinnedPaths, pageParam),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
	});
	const filesQuery = useQuery({
		queryKey: ["navigation", "all-docs", "folio-files", folderPrefix],
		queryFn: () => listNonMarkdownFiles(folderPrefix),
		enabled: includesNonMarkdownFiles,
	});

	const items = useMemo(
		() =>
			mergeFolioItems(
				notesQuery.data?.pages.flatMap((page) => page.items) ?? [],
				includesNonMarkdownFiles ? (filesQuery.data?.files ?? []) : [],
				query,
			),
		[filesQuery.data?.files, includesNonMarkdownFiles, notesQuery.data?.pages, query],
	);
	const loadedPageCount = notesQuery.data?.pages.length ?? 0;
	const contentUpdatedAtMs = Math.max(
		notesQuery.dataUpdatedAt,
		includesNonMarkdownFiles ? filesQuery.dataUpdatedAt : 0,
	);
	const fetchNextPage = useCallback(async () => {
		const result = await notesQuery.fetchNextPage();
		return result.data?.pages[loadedPageCount]?.items ?? [];
	}, [loadedPageCount, notesQuery.fetchNextPage]);

	return {
		notes: items,
		contentUpdatedAtMs,
		filesTruncated: includesNonMarkdownFiles && (filesQuery.data?.truncated ?? false),
		error: notesQuery.error ?? (includesNonMarkdownFiles ? filesQuery.error : null),
		nonMarkdownFileLimit: FOLIO_NON_MARKDOWN_FILE_LIMIT,
		hasNextPage: notesQuery.hasNextPage,
		isFetchingNextPage: notesQuery.isFetchingNextPage,
		isLoading: notesQuery.isPending,
		fetchNextPage,
	};
}
