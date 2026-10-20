import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";
import { cn } from "../../../lib/utils";
import { Select } from "../../ui/shadcn/select";
import type {
	AttachmentFilters,
	AttachmentKindFilter,
	AttachmentSort,
	AttachmentUsageFilter,
} from "./useAttachmentFilters";

const USAGE_OPTIONS = ["unused", "all"] as const satisfies readonly AttachmentUsageFilter[];
const SORT_OPTIONS = ["size", "name"] as const satisfies readonly AttachmentSort[];

export function AttachmentToolbar({ filters }: { filters: AttachmentFilters }) {
	const { t } = useTranslation("settings.general");
	const counts: Record<AttachmentUsageFilter, number> = {
		unused: filters.unusedTotals.count,
		all: filters.allTotals.count,
	};

	const kindOptions: readonly AttachmentKindFilter[] = ["any", ...filters.kinds];

	return (
		<div className="attachmentToolbar">
			<div
				className="attachmentTabs"
				role="tablist"
				aria-label={t("developer.attachments.usageFilter")}
			>
				{USAGE_OPTIONS.map((option) => (
					<button
						key={option}
						type="button"
						role="tab"
						aria-selected={filters.usage === option}
						className={cn("attachmentTab", filters.usage === option && "is-active")}
						onClick={() => filters.setUsage(option)}
					>
						{t(`developer.attachments.usage.${option}`)}
						<span className="attachmentTabCount">{counts[option]}</span>
					</button>
				))}
			</div>
			<label className="attachmentSearch">
				<HugeiconsIcon icon={Search01Icon} size="var(--icon-sm)" aria-hidden="true" />
				<input
					type="search"
					value={filters.query}
					placeholder={t("developer.attachments.searchPlaceholder")}
					aria-label={t("developer.attachments.searchPlaceholder")}
					onChange={(event) => filters.setQuery(event.target.value)}
				/>
			</label>
			{filters.kinds.length > 1 ? (
				<Select
					className="attachmentSelect"
					value={filters.kind}
					aria-label={t("developer.attachments.kindFilter")}
					options={kindOptions.map((kind) => ({
						value: kind,
						label: t(`developer.attachments.kind.${kind}`),
					}))}
					onValueChange={filters.setKind}
				/>
			) : null}
			<Select
				className="attachmentSelect"
				value={filters.sort}
				aria-label={t("developer.attachments.sortLabel")}
				options={SORT_OPTIONS.map((option) => ({
					value: option,
					label: t(`developer.attachments.sort.${option}`),
				}))}
				onValueChange={filters.setSort}
			/>
		</div>
	);
}
