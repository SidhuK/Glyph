import { useQuery } from "@tanstack/react-query";
import {
	type ReactNode,
	createContext,
	useContext,
	useMemo,
} from "react";
import { isImageTarget } from "../../../lib/linkSuggestions";
import {
	type TransclusionRequest,
	type TransclusionResult,
	invoke,
} from "../../../lib/tauri";
import { useTauriEvent } from "../../../lib/tauriEvents";
import { findWikiLinkSpans, parseWikiLink } from "../markdown/wikiLinkCodec";

const MAX_TRANSCLUSION_DEPTH = 4;
const EMPTY_RESULTS = new Map<string, TransclusionResult>();

interface TransclusionContextValue {
	ancestors: readonly string[];
	depth: number;
	results: ReadonlyMap<string, TransclusionResult>;
	isLoading: boolean;
}

const TransclusionContext = createContext<TransclusionContextValue>({
	ancestors: [],
	depth: 0,
	results: EMPTY_RESULTS,
	isLoading: false,
});

export function transclusionKey(
	target: string,
	anchorKind: TransclusionRequest["anchor_kind"],
	anchor: string | null,
): string {
	return `${target}\0${anchorKind}\0${anchor ?? ""}`;
}

function requestsFromMarkdown(markdown: string) {
	const requests = new Map<string, TransclusionRequest>();
	for (const span of findWikiLinkSpans(markdown)) {
		const parsed = parseWikiLink(span.raw);
		if (!parsed?.embed || isImageTarget(parsed.target)) {
			continue;
		}
		const key = transclusionKey(
			parsed.target,
			parsed.anchorKind,
			parsed.anchor,
		);
		requests.set(key, {
			key,
			target: parsed.target,
			anchor_kind: parsed.anchorKind,
			anchor: parsed.anchor,
		});
	}
	return Array.from(requests.values());
}

export function TransclusionDataProvider({
	markdown,
	relPath,
	children,
}: {
	markdown: string;
	relPath?: string;
	children: ReactNode;
}) {
	const parent = useContext(TransclusionContext);
	const requests = useMemo(() => requestsFromMarkdown(markdown), [markdown]);
	const requestKey = useMemo(
		() => requests.map((request) => request.key).sort(),
		[requests],
	);
	const queryKey = useMemo(
		() => ["note-transclusions", relPath ?? "", requestKey] as const,
		[relPath, requestKey],
	);
	const query = useQuery({
		queryKey,
		queryFn: () => invoke("space_transclusions_batch", { requests }),
		enabled: requests.length > 0,
		staleTime: Number.POSITIVE_INFINITY,
	});
	useTauriEvent("notes:external_changed", (payload) => {
		if (
			query.data?.some((result) => result.resolved_path === payload.rel_path)
		) {
			void query.refetch();
		}
	});
	const results = useMemo(
		() => new Map((query.data ?? []).map((result) => [result.key, result])),
		[query.data],
	);
	const ancestors = useMemo(() => {
		if (!relPath || parent.ancestors.includes(relPath)) return parent.ancestors;
		return [...parent.ancestors, relPath];
	}, [parent.ancestors, relPath]);
	const value = useMemo<TransclusionContextValue>(
		() => ({
			ancestors,
			depth: parent.depth,
			results,
			isLoading: query.isLoading,
		}),
		[ancestors, parent.depth, query.isLoading, results],
	);
	return (
		<TransclusionContext.Provider value={value}>
			{children}
		</TransclusionContext.Provider>
	);
}

export function TransclusionBranch({
	resolvedPath,
	children,
}: {
	resolvedPath: string;
	children: ReactNode;
}) {
	const parent = useContext(TransclusionContext);
	const value = useMemo<TransclusionContextValue>(
		() => ({
			...parent,
			ancestors: [...parent.ancestors, resolvedPath],
			depth: parent.depth + 1,
			results: EMPTY_RESULTS,
		}),
		[parent, resolvedPath],
	);
	return (
		<TransclusionContext.Provider value={value}>
			{children}
		</TransclusionContext.Provider>
	);
}

export function useTransclusion(
	target: string,
	anchorKind: TransclusionRequest["anchor_kind"],
	anchor: string | null,
) {
	const context = useContext(TransclusionContext);
	const result = context.results.get(
		transclusionKey(target, anchorKind, anchor),
	);
	const recursive = Boolean(
		result?.resolved_path && context.ancestors.includes(result.resolved_path),
	);
	return {
		...context,
		result,
		recursive,
		depthExceeded: context.depth >= MAX_TRANSCLUSION_DEPTH,
	};
}
