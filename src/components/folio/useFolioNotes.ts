import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { loadAllDocs, navigationQueryKeys } from "../../lib/navigationPrefetch";
import type { AllDocsItem, FsEntry, FsEntryList } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { basename } from "../../utils/path";
import {
	type FolioScope,
	folioScopeTitle,
	normalizeFolioPath,
} from "./folioScopes";

export interface FolioItem extends Omit<AllDocsItem, "created" | "updated"> {
	created: string | null;
	updated: string | null;
	is_markdown: boolean;
}

const FOLIO_NON_MARKDOWN_FILE_LIMIT = 5_000;

const folioFilesQueryKey = (folderPrefix: string | null) =>
	["navigation", "folio-files", folderPrefix ?? "__all__"] as const;

function folderForScope(scope: FolioScope): string | null {
	if (scope.kind !== "folder") return null;
	return normalizeFolioPath(scope.folderPrefix) || null;
}

function tagMatches(noteTags: string[], tag: string): boolean {
	const normalizedTag = tag.trim().replace(/^[#@]/, "").toLowerCase();
	if (!normalizedTag) return false;
	return noteTags.some(
		(noteTag) =>
			noteTag.trim().replace(/^[#@]/, "").toLowerCase() === normalizedTag,
	);
}

function personMatches(
	notePeople: string[] | undefined,
	handle: string,
): boolean {
	const normalizedHandle = handle.trim().replace(/^@/, "").toLowerCase();
	if (!normalizedHandle) return false;
	return (notePeople ?? []).some(
		(notePerson) =>
			notePerson.trim().replace(/^@/, "").toLowerCase() === normalizedHandle,
	);
}

function filterNotesForScope(
	notes: FolioItem[],
	scope: FolioScope,
): FolioItem[] {
	switch (scope.kind) {
		case "tag":
			return notes.filter(
				(note) => note.is_markdown && tagMatches(note.tags, scope.tag),
			);
		case "person":
			return notes.filter(
				(note) => note.is_markdown && personMatches(note.people, scope.handle),
			);
		case "search": {
			const query = scope.query.trim().toLowerCase();
			if (!query) return notes;
			return notes.filter((note) => {
				const haystack = [
					note.title,
					note.preview,
					note.note_path,
					...note.tags,
				]
					.join(" ")
					.toLowerCase();
				return haystack.includes(query);
			});
		}
		default:
			return notes;
	}
}

function normalizeRelPath(path: string): string {
	return path
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

function titleFromFilePath(path: string): string {
	const name = basename(path);
	return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

function fileEntryToFolioItem(entry: FsEntry): FolioItem {
	return {
		note_path: normalizeRelPath(entry.rel_path),
		title: titleFromFilePath(entry.rel_path),
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
	const list =
		result !== null && typeof result === "object"
			? (result as Partial<FsEntryList>)
			: {};
	const files = Array.isArray(list.files) ? list.files : [];
	return {
		files: files.map(fileEntryToFolioItem),
		truncated: list.truncated === true,
	};
}

function mergeFolioItems(notes: AllDocsItem[], files: FolioItem[]) {
	const out = new Map<string, FolioItem>();
	for (const note of notes) {
		const path = normalizeRelPath(note.note_path);
		if (!path) continue;
		out.set(path, { ...note, note_path: path, is_markdown: true });
	}
	for (const file of files) {
		if (!file.note_path || out.has(file.note_path)) continue;
		out.set(file.note_path, file);
	}
	return Array.from(out.values());
}

export function useFolioNotes(scope: FolioScope) {
	const queryClient = useQueryClient();
	const folderPrefix = folderForScope(scope);
	const includesNonMarkdownFiles =
		scope.kind !== "tag" && scope.kind !== "person";
	const query = useQuery({
		queryKey: navigationQueryKeys.allDocsList(folderPrefix),
		queryFn: () => loadAllDocs(folderPrefix),
	});
	const filesQuery = useQuery({
		queryKey: folioFilesQueryKey(folderPrefix),
		queryFn: () => listNonMarkdownFiles(folderPrefix),
		enabled: includesNonMarkdownFiles,
	});

	useTauriEvent("notes:external_changed", () => {
		void queryClient.invalidateQueries({
			queryKey: navigationQueryKeys.allDocsList(folderPrefix),
		});
	});
	useTauriEvent("space:fs_changed", () => {
		void queryClient.invalidateQueries({
			queryKey: navigationQueryKeys.allDocsList(folderPrefix),
		});
		void queryClient.invalidateQueries({
			queryKey: folioFilesQueryKey(folderPrefix),
		});
	});

	const items = useMemo(
		() =>
			filterNotesForScope(
				mergeFolioItems(query.data ?? [], filesQuery.data?.files ?? []),
				scope,
			),
		[filesQuery.data?.files, query.data, scope],
	);

	return {
		notes: items,
		filesTruncated:
			includesNonMarkdownFiles && (filesQuery.data?.truncated ?? false),
		error: query.error ?? filesQuery.error,
		title: folioScopeTitle(scope),
		nonMarkdownFileLimit: FOLIO_NON_MARKDOWN_FILE_LIMIT,
	};
}
