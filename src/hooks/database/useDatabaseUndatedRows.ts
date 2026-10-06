import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { navigationQueryKeys } from "../../lib/navigationPrefetch";
import { type DatabaseDateRange, invoke } from "../../lib/tauri";

const UNDATED_PAGE_SIZE = 48;
const UNDATED_RANGE: DatabaseDateRange = { kind: "undated" };

/** Rows without a value in the calendar's date column, paged for the Unscheduled tray. */
export function useDatabaseUndatedRows(databaseId: string, viewId: string, enabled: boolean) {
	const query = useInfiniteQuery({
		queryKey: navigationQueryKeys.databaseRowsPages(
			databaseId,
			viewId,
			UNDATED_PAGE_SIZE,
			UNDATED_RANGE,
		),
		queryFn: ({ pageParam }) =>
			invoke("databases_query_rows", {
				database_id: databaseId,
				view_id: viewId,
				offset: pageParam,
				limit: UNDATED_PAGE_SIZE,
				date_range: UNDATED_RANGE,
			}),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.next_offset ?? undefined,
		enabled,
	});
	const rows = useMemo(() => query.data?.pages.flatMap((page) => page.rows) ?? [], [query.data]);
	return {
		rows,
		totalCount: query.data?.pages[0]?.total_count ?? 0,
		error: query.error,
		hasMore: query.hasNextPage,
		isLoadingMore: query.isFetchingNextPage,
		loadMore: query.fetchNextPage,
	};
}
