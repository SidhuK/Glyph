import type { VirtualItem } from "@tanstack/react-virtual";
import { type RefObject, useEffect } from "react";

interface LoadMoreState {
	hasMore: boolean;
	isLoading: boolean;
	onLoadMore?: () => undefined | Promise<unknown>;
}

interface VirtualLoadMoreOptions extends LoadMoreState {
	virtualItems: VirtualItem[];
	totalItems: number;
	remainingItems: number;
}

export function useVirtualLoadMore({
	hasMore,
	isLoading,
	onLoadMore,
	virtualItems,
	totalItems,
	remainingItems,
}: VirtualLoadMoreOptions) {
	useEffect(() => {
		if (!hasMore || isLoading || !onLoadMore) return;
		const lastVirtualItem = virtualItems[virtualItems.length - 1];
		if (!lastVirtualItem) return;
		if (lastVirtualItem.index < totalItems - remainingItems) return;
		void onLoadMore();
	}, [
		hasMore,
		isLoading,
		onLoadMore,
		remainingItems,
		totalItems,
		virtualItems,
	]);
}

interface SentinelLoadMoreOptions<
	TRoot extends Element,
	TSentinel extends Element,
> extends LoadMoreState {
	rootRef: RefObject<TRoot | null>;
	sentinelRef: RefObject<TSentinel | null>;
	rootMargin?: string;
}

export function useSentinelLoadMore<
	TRoot extends Element,
	TSentinel extends Element,
>({
	hasMore,
	isLoading,
	onLoadMore,
	rootRef,
	sentinelRef,
	rootMargin = "0px",
}: SentinelLoadMoreOptions<TRoot, TSentinel>) {
	useEffect(() => {
		const root = rootRef.current;
		const sentinel = sentinelRef.current;
		if (!root || !sentinel || !hasMore || !onLoadMore) return;
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (!entry?.isIntersecting || isLoading) return;
				void onLoadMore();
			},
			{ root, rootMargin, threshold: 0 },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [hasMore, isLoading, onLoadMore, rootMargin, rootRef, sentinelRef]);
}
