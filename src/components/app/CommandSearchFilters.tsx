import * as Icons from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SearchAdvancedRequest } from "../../lib/tauri";
import { buildSearchQuery } from "./commandPaletteHelpers";

interface CommandSearchFiltersProps {
	request: SearchAdvancedRequest;
	onChangeQuery: (next: string) => void;
}

function withUpdated(
	request: SearchAdvancedRequest,
	next: Partial<SearchAdvancedRequest>,
): string {
	return buildSearchQuery({ ...request, ...next });
}

export function CommandSearchFilters({
	request,
	onChangeQuery,
}: CommandSearchFiltersProps) {
	return (
		<div className="commandSearchFilters">
			<button
				type="button"
				className="commandSearchFilterBtn"
				data-active={request.title_only ? "true" : "false"}
				onClick={() =>
					onChangeQuery(
						withUpdated(request, { title_only: !request.title_only }),
					)
				}
			>
				<HugeiconsIcon icon={Icons.Document} size={14} />
				Title only
			</button>
			<button
				type="button"
				className="commandSearchFilterBtn"
				data-active={request.tag_only ? "true" : "false"}
				onClick={() =>
					onChangeQuery(withUpdated(request, { tag_only: !request.tag_only }))
				}
			>
				<HugeiconsIcon icon={Icons.Tag01Icon} size={14} />
				Tag
			</button>
		</div>
	);
}
