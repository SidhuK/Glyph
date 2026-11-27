import { File01Icon, Folder01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { buildDatabaseTagPickerOptions } from "@/components/database/DatabaseTagPicker";
import { formatTagLabel } from "@/components/editor/noteProperties/utils";
import { useFileTreeContext } from "@/contexts";
import { displayNameFromPath } from "@/utils/path";
import { useSpaceFolders, useSpaceNotes } from "../data/useSpaceNotes";
import { TaskSearchList, type TaskSearchItem, searchItemIcon } from "../menus/TaskSearchList";
import { notePathLabel } from "../model/taskTitle";
import { toggledValue } from "./taskFilterKinds";

const FILTER_RESULT_LIMIT = 50;

interface ListEditorProps {
	selected: readonly string[];
	onChange: (values: string[]) => void;
}

function matchingPaths(
	paths: readonly string[],
	selected: readonly string[],
	needle: string,
): string[] {
	const chosen = new Set(selected);
	const matches = paths.filter((path) => !chosen.has(path) && path.toLowerCase().includes(needle));
	return [...selected, ...matches.slice(0, FILTER_RESULT_LIMIT)];
}

export function NoteFilterEditor({ selected, onChange }: ListEditorProps) {
	const { t } = useTranslation("shell");
	const [query, setQuery] = useState("");
	const notes = useSpaceNotes(true);
	const items = matchingPaths(notes.data ?? [], selected, query.trim().toLowerCase()).map(
		(path): TaskSearchItem => ({
			id: path,
			label: displayNameFromPath(path),
			detail: notePathLabel(path),
			icon: searchItemIcon(File01Icon),
			selected: selected.includes(path),
		}),
	);
	return (
		<TaskSearchList
			label={t("tasks.filters.kinds.note")}
			placeholder={t("tasks.filters.searchNotes")}
			emptyLabel={notes.isPending ? t("tasks.loading") : t("tasks.quickAdd.noNotes")}
			query={query}
			onQueryChange={setQuery}
			items={items}
			onSelect={(path) => onChange(toggledValue(selected, path))}
		/>
	);
}

export function FolderFilterEditor({ selected, onChange }: ListEditorProps) {
	const { t } = useTranslation("shell");
	const [query, setQuery] = useState("");
	const folders = useSpaceFolders();
	const items = matchingPaths(folders.data ?? [], selected, query.trim().toLowerCase()).map(
		(path): TaskSearchItem => ({
			id: path,
			label: path,
			icon: searchItemIcon(Folder01Icon),
			selected: selected.includes(path),
		}),
	);
	return (
		<TaskSearchList
			label={t("tasks.filters.kinds.folder")}
			placeholder={t("tasks.filters.searchFolders")}
			emptyLabel={folders.isPending ? t("tasks.loading") : t("tasks.filters.noFolders")}
			query={query}
			onQueryChange={setQuery}
			items={items}
			onSelect={(path) => onChange(toggledValue(selected, path))}
		/>
	);
}

export function TagFilterEditor({ selected, onChange }: ListEditorProps) {
	const { t } = useTranslation("shell");
	const { tags } = useFileTreeContext();
	const [query, setQuery] = useState("");
	const chosen = new Set(selected);
	const options = buildDatabaseTagPickerOptions(tags, query, FILTER_RESULT_LIMIT)
		.map(({ tag }) => tag)
		.filter((tag) => !chosen.has(tag));
	const items = [...selected, ...options].map((tag): TaskSearchItem => ({
		id: tag,
		label: formatTagLabel(tag),
		selected: chosen.has(tag),
	}));
	return (
		<TaskSearchList
			label={t("tasks.filters.kinds.tag")}
			placeholder={t("tasks.properties.tagPlaceholder")}
			emptyLabel={t("tasks.properties.noTags")}
			query={query}
			onQueryChange={setQuery}
			items={items}
			onSelect={(tag) => onChange(toggledValue(selected, tag))}
		/>
	);
}
