import { Document, Tag01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";
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
	const { t } = useTranslation("shell");
	return (
		<div className="commandSearchFilters">
			<button
				type="button"
				className="commandSearchFilterBtn"
				data-active={request.title_only ? "true" : "false"}
				aria-pressed={request.title_only}
				onClick={() =>
					onChangeQuery(
						withUpdated(request, { title_only: !request.title_only }),
					)
				}
			>
				<HugeiconsIcon
					icon={Document}
					size="var(--icon-md)"
					strokeWidth={0.9}
				/>
				{t("commandPalette.filterTitle")}
			</button>
			<button
				type="button"
				className="commandSearchFilterBtn"
				data-active={request.tag_only ? "true" : "false"}
				aria-pressed={request.tag_only}
				onClick={() =>
					onChangeQuery(withUpdated(request, { tag_only: !request.tag_only }))
				}
			>
				<HugeiconsIcon
					icon={Tag01Icon}
					size="var(--icon-md)"
					strokeWidth={0.9}
				/>
				{t("commandPalette.filterTag")}
			</button>
		</div>
	);
}
