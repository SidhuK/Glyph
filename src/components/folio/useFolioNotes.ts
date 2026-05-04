import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { loadAllDocs, navigationQueryKeys } from "../../lib/navigationPrefetch";
import type { AllDocsItem } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import {
	type FolioScope,
	folioScopeTitle,
	normalizeFolioPath,
} from "./folioScopes";

function folderForScope(scope: FolioScope): string | null {
	switch (scope.kind) {
		case "folder":
			return normalizeFolioPath(scope.folderPrefix) || null;
		case "daily":
		case "templates":
			return normalizeFolioPath(scope.folderPrefix) || null;
		default:
			return null;
	}
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
	notes: AllDocsItem[],
	scope: FolioScope,
): AllDocsItem[] {
	switch (scope.kind) {
		case "tag":
			return notes.filter((note) => tagMatches(note.tags, scope.tag));
		case "person":
			return notes.filter((note) => personMatches(note.people, scope.handle));
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

export function useFolioNotes(scope: FolioScope) {
	const queryClient = useQueryClient();
	const folderPrefix = folderForScope(scope);
	const folderRequired =
		(scope.kind === "daily" || scope.kind === "templates") && !folderPrefix;
	const query = useQuery({
		queryKey: navigationQueryKeys.allDocsList(folderPrefix),
		queryFn: () => loadAllDocs(folderPrefix),
		enabled: !folderRequired,
	});

	useTauriEvent("notes:external_changed", () => {
		void queryClient.invalidateQueries({
			queryKey: navigationQueryKeys.allDocsList(folderPrefix),
		});
	});

	const notes = useMemo(
		() => filterNotesForScope(query.data ?? [], scope),
		[query.data, scope],
	);

	return {
		notes,
		isLoading: query.isLoading,
		error: query.error,
		title: folioScopeTitle(scope),
		missingFolder: folderRequired,
	};
}
