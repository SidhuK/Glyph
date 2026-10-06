import { useCallback, useMemo, useState } from "react";
import type { AttachmentEntry, AttachmentKind } from "../../../lib/tauri";

export type AttachmentUsageFilter = "unused" | "all";
export type AttachmentKindFilter = AttachmentKind | "any";
export type AttachmentSort = "size" | "name";

export interface AttachmentTotals {
	count: number;
	bytes: number;
}

function totals(entries: readonly AttachmentEntry[]): AttachmentTotals {
	let bytes = 0;
	for (const entry of entries) bytes += entry.size;
	return { count: entries.length, bytes };
}

export function isUnused(entry: AttachmentEntry): boolean {
	return entry.referenced_by.length === 0;
}

export function useAttachmentFilters(attachments: readonly AttachmentEntry[]) {
	const [usage, setUsage] = useState<AttachmentUsageFilter>("unused");
	const [kindChoice, setKind] = useState<AttachmentKindFilter>("any");
	const [sort, setSort] = useState<AttachmentSort>("size");
	const [query, setQuery] = useState("");
	const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());

	const unused = useMemo(() => attachments.filter(isUnused), [attachments]);

	const kinds = useMemo(() => {
		const present = new Set<AttachmentKind>();
		for (const entry of attachments) present.add(entry.kind);
		return [...present];
	}, [attachments]);
	// A rescan can remove the chosen type (and hide its selector), so fall back
	// to all types rather than leave an empty list with no way out.
	const kind = kindChoice === "any" || kinds.includes(kindChoice) ? kindChoice : "any";

	const visible = useMemo(() => {
		const needle = query.trim().toLowerCase();
		const filtered = (usage === "unused" ? unused : attachments).filter(
			(entry) =>
				(kind === "any" || entry.kind === kind) &&
				(needle.length === 0 || entry.rel_path.toLowerCase().includes(needle)),
		);
		return sort === "size"
			? filtered.sort((a, b) => b.size - a.size)
			: filtered.sort(
					(a, b) => a.name.localeCompare(b.name) || a.rel_path.localeCompare(b.rel_path),
				);
	}, [attachments, unused, usage, kind, sort, query]);

	// Only unused files that are still on screen can be trashed, so a rescan or a
	// filter change never leaves hidden or newly referenced files selected.
	const selected = useMemo(
		() => visible.filter((entry) => isUnused(entry) && selection.has(entry.rel_path)),
		[visible, selection],
	);
	const selectedPaths = useMemo(() => new Set(selected.map((entry) => entry.rel_path)), [selected]);
	const selectable = useMemo(() => visible.filter(isUnused), [visible]);

	// Stable so memoized rows skip re-rendering when another row is toggled.
	const toggle = useCallback(
		(path: string) =>
			setSelection((prev) => {
				const next = new Set(prev);
				if (next.has(path)) next.delete(path);
				else next.add(path);
				return next;
			}),
		[],
	);

	const setAllSelected = (checked: boolean) =>
		setSelection(checked ? new Set(selectable.map((entry) => entry.rel_path)) : new Set());

	return {
		usage,
		setUsage,
		kind,
		setKind,
		kinds,
		sort,
		setSort,
		query,
		setQuery,
		visible,
		selected,
		selectedPaths,
		selectedTotals: totals(selected),
		allSelected: selectable.length > 0 && selected.length === selectable.length,
		hasSelectable: selectable.length > 0,
		toggle,
		setAllSelected,
		clearSelection: () => setSelection(new Set()),
		allTotals: totals(attachments),
		unusedTotals: totals(unused),
	};
}

export type AttachmentFilters = ReturnType<typeof useAttachmentFilters>;
