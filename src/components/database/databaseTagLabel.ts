import { formatTagLabel } from "../editor/noteProperties/utils";

export function formatDatabaseTagLabel(tag: string): string {
	return formatTagLabel(tag).replace(/^#/, "");
}
