import { useQuery } from "@tanstack/react-query";
import { invoke } from "../lib/tauri";
import type { PersonCount, TagCount } from "../lib/tauri";

const PAGE_SIZE = 500;

export function useWorkspaceTags(
	spacePath: string | null,
	folder: string | null,
) {
	return useQuery({
		queryKey: ["folder-workspace", "tags", spacePath, folder],
		enabled: Boolean(spacePath && folder),
		queryFn: async () => {
			const tags: TagCount[] = [];
			const people: PersonCount[] = [];
			for (let offset = 0; ; offset += PAGE_SIZE) {
				const page = await invoke("tags_list", {
					folder_prefix: folder,
					limit: PAGE_SIZE,
					offset,
				});
				tags.push(...page);
				if (page.length < PAGE_SIZE) break;
			}
			for (let offset = 0; ; offset += PAGE_SIZE) {
				const page = await invoke("people_list", {
					folder_prefix: folder,
					limit: PAGE_SIZE,
					offset,
				});
				people.push(...page);
				if (page.length < PAGE_SIZE) break;
			}
			return { tags, people };
		},
	});
}
