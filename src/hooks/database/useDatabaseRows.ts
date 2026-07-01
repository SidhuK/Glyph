import {
	type InfiniteData,
	useInfiniteQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	invalidateDatabasePrefetch,
	navigationQueryKeys,
} from "../../lib/navigationPrefetch";
import type {
	DatabaseRow,
	WorkspaceDatabaseDocument,
	WorkspaceDatabaseQueryResult,
} from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { useDebouncedNoteChange } from "../useDebouncedNoteChange";
import type { PaneErrorHandlers } from "./types";

export interface UseDatabaseRowsOptions extends PaneErrorHandlers {
	selectedDatabaseId: string | null;
	selectedViewId: string | null;
	document: WorkspaceDatabaseDocument | null;
	pageSize?: number;
}

type DatabaseRowsPagesData = InfiniteData<WorkspaceDatabaseQueryResult, number>;

function rebuildRowsPages(
	current: DatabaseRowsPagesData | undefined,
	rows: DatabaseRow[],
	pageSize: number,
): DatabaseRowsPagesData {
	const fallbackPage = current?.pages.find(
		(page) => page.available_properties.length > 0,
	);
	const availableProperties = fallbackPage?.available_properties ?? [];
	const hadMore = current?.pages[current.pages.length - 1]?.next_offset != null;
	const totalCount = hadMore
		? Math.max(current?.pages[0]?.total_count ?? 0, rows.length)
		: rows.length;
	const pages: WorkspaceDatabaseQueryResult[] = [];
	for (let offset = 0; offset < rows.length; offset += pageSize) {
		const pageRows = rows.slice(offset, offset + pageSize);
		const hasLocalNext = offset + pageSize < rows.length;
		pages.push({
			rows: pageRows,
			available_properties: availableProperties,
			total_count: totalCount,
			truncated: hasLocalNext || hadMore,
			next_offset: hasLocalNext || hadMore ? offset + pageRows.length : null,
		});
	}
	if (pages.length === 0) {
		return {
			pages: [
				{
					rows: [],
					available_properties: availableProperties,
					total_count: totalCount,
					truncated: hadMore,
					next_offset: hadMore ? 0 : null,
				},
			],
			pageParams: [0],
		};
	}
	return {
		pages,
		pageParams: pages.map((_, index) => index * pageSize),
	};
}

export function useDatabaseRows({
	selectedDatabaseId,
	selectedViewId,
	document,
	pageSize = 200,
	setError,
}: UseDatabaseRowsOptions) {
	const queryClient = useQueryClient();
	const [selectedRowPath, setSelectedRowPath] = useState<string | null>(null);
	const previousSelectionRef = useRef<{
		databaseId: string | null;
		viewId: string | null;
		pageSize: number;
	} | null>(null);

	const canLoadRows =
		selectedDatabaseId != null &&
		selectedViewId != null &&
		document != null &&
		document.database.id === selectedDatabaseId &&
		document.database.views.some((view) => view.id === selectedViewId);
	const rowsQueryKey = useMemo(
		() =>
			selectedDatabaseId && selectedViewId
				? navigationQueryKeys.databaseRowsPages(
						selectedDatabaseId,
						selectedViewId,
						pageSize,
					)
				: [...navigationQueryKeys.databases(), "rows-pages", "__inactive__"],
		[pageSize, selectedDatabaseId, selectedViewId],
	);
	const rowsQuery = useInfiniteQuery<WorkspaceDatabaseQueryResult, Error>({
		queryKey: rowsQueryKey,
		queryFn: ({ pageParam }) => {
			const offset = typeof pageParam === "number" ? pageParam : 0;
			return invoke("databases_query_rows", {
				database_id: selectedDatabaseId ?? "",
				view_id: selectedViewId ?? "",
				offset,
				limit: pageSize,
			});
		},
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.next_offset ?? undefined,
		enabled: canLoadRows,
	});

	const rows = useMemo(
		() => rowsQuery.data?.pages.flatMap((page) => page.rows) ?? [],
		[rowsQuery.data],
	);
	const setRows = useCallback<Dispatch<SetStateAction<DatabaseRow[]>>>(
		(updater) => {
			if (!selectedDatabaseId || !selectedViewId) return;
			queryClient.setQueryData<DatabaseRowsPagesData>(
				rowsQueryKey,
				(current) => {
					const currentRows = current?.pages.flatMap((page) => page.rows) ?? [];
					const nextRows =
						typeof updater === "function" ? updater(currentRows) : updater;
					return rebuildRowsPages(current, nextRows, pageSize);
				},
			);
		},
		[pageSize, queryClient, rowsQueryKey, selectedDatabaseId, selectedViewId],
	);

	const clearRows = useCallback(() => {
		setSelectedRowPath(null);
	}, []);

	useEffect(() => {
		const previous = previousSelectionRef.current;
		if (
			previous?.databaseId === selectedDatabaseId &&
			previous.viewId === selectedViewId &&
			previous.pageSize === pageSize
		) {
			return;
		}
		previousSelectionRef.current = {
			databaseId: selectedDatabaseId,
			viewId: selectedViewId,
			pageSize,
		};
		setSelectedRowPath(null);
	}, [pageSize, selectedDatabaseId, selectedViewId]);

	const loadRows = useCallback(async () => {
		if (!canLoadRows) {
			setSelectedRowPath(null);
			return;
		}
		await rowsQuery.refetch();
	}, [canLoadRows, rowsQuery]);

	useEffect(() => {
		if (rowsQuery.error) {
			setError(extractErrorMessage(rowsQuery.error));
		}
	}, [rowsQuery.error, setError]);

	useDebouncedNoteChange({
		delayMs: 150,
		onChange: () => {
			if (selectedDatabaseId) {
				invalidateDatabasePrefetch(selectedDatabaseId);
			}
			void loadRows();
		},
	});

	return {
		rows,
		setRows,
		hasMoreRows: rowsQuery.hasNextPage,
		isLoadingMoreRows: rowsQuery.isFetchingNextPage,
		loadMoreRows: rowsQuery.fetchNextPage,
		selectedRowPath,
		setSelectedRowPath,
		loadRows,
		clearRows,
	};
}
