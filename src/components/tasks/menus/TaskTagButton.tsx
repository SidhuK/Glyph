import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Tag01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { buildDatabaseTagPickerOptions } from "@/components/database/DatabaseTagPicker";
import { formatTagLabel, normalizeTagToken } from "@/components/editor/noteProperties/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import { Hash } from "@/components/Icons";
import { useFileTreeContext } from "@/contexts";
import type { TaskRecord } from "@/lib/tauri";
import { useTasks } from "../TasksContext";
import { TaskSearchList } from "./TaskSearchList";

const TAG_OPTION_LIMIT = 40;

function TaskTagPicker({ record, onDone }: { record: TaskRecord; onDone: () => void }) {
	const { t } = useTranslation("shell");
	const { tags } = useFileTreeContext();
	const { setTitle } = useTasks();
	const [query, setQuery] = useState("");
	const taken = new Set(record.tags);
	const options = buildDatabaseTagPickerOptions(tags, query, TAG_OPTION_LIMIT).filter(
		({ tag }) => !taken.has(tag),
	);
	const draft = normalizeTagToken(query);
	const canCreate =
		draft !== null && !taken.has(draft) && !options.some(({ tag }) => tag === draft);
	const addTag = (tag: string) => {
		onDone();
		void setTitle(record, `${record.title.trimEnd()} #${tag}`);
	};
	return (
		<TaskSearchList
			label={t("tasks.properties.tagSearch")}
			placeholder={t("tasks.properties.tagPlaceholder")}
			emptyLabel={t("tasks.properties.noTags")}
			query={query}
			onQueryChange={setQuery}
			items={options.map(({ tag }) => ({
				id: tag,
				label: tag,
				icon: <Hash className="glyphMenuItemIcon" aria-hidden="true" />,
			}))}
			onSelect={addTag}
			create={
				canCreate
					? {
							label: t("tasks.properties.createTag", { tag: formatTagLabel(draft) }),
							onCreate: () => addTag(draft),
						}
					: null
			}
		/>
	);
}

export function TaskTagButton({ record }: { record: TaskRecord }) {
	const { t } = useTranslation("shell");
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={<button type="button" className="tasksPropertyButton" data-empty="true" />}
			>
				<HugeiconsIcon icon={Tag01Icon} size="var(--icon-sm)" aria-hidden="true" />
				<span>{t("tasks.properties.tag")}</span>
			</PopoverTrigger>
			<PopoverContent align="start" sideOffset={6} className="tasksPopover">
				{open ? <TaskTagPicker record={record} onDone={() => setOpen(false)} /> : null}
			</PopoverContent>
		</Popover>
	);
}
