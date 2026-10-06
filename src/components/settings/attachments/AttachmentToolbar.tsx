import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";
import { cn } from "../../../lib/utils";
import type {
	AttachmentFilters,
	AttachmentKindFilter,
	AttachmentSort,
	AttachmentUsageFilter,
} from "./useAttachmentFilters";

const USAGE_OPTIONS = ["unused", "all"] as const satisfies readonly AttachmentUsageFilter[];
const SORT_OPTIONS = ["size", "name"] as const satisfies readonly AttachmentSort[];

function isSort(value: string): value is AttachmentSort {
	return SORT_OPTIONS.some((option) => option === value);
}

function findKind(
	options: readonly AttachmentKindFilter[],
	value: string,
): AttachmentKindFilter | undefined {
	return options.find((option) => option === value);
}

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
				<select
					className="attachmentSelect"
					value={filters.kind}
					aria-label={t("developer.attachments.kindFilter")}
					onChange={(event) => {
						const kind = findKind(kindOptions, event.target.value);
						if (kind) filters.setKind(kind);
					}}
				>
					{kindOptions.map((kind) => (
						<option key={kind} value={kind}>
							{t(`developer.attachments.kind.${kind}`)}
						</option>
					))}
				</select>
			) : null}
			<select
				className="attachmentSelect"
				value={filters.sort}
				aria-label={t("developer.attachments.sortLabel")}
				onChange={(event) => {
					if (isSort(event.target.value)) filters.setSort(event.target.value);
				}}
			>
				{SORT_OPTIONS.map((option) => (
					<option key={option} value={option}>
						{t(`developer.attachments.sort.${option}`)}
					</option>
				))}
			</select>
		</div>
	);
}
