import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";
import { SettingsSelect } from "../SettingsSelect";
import type {
	AttachmentFilters,
	AttachmentSort,
	AttachmentUsageFilter,
} from "./useAttachmentFilters";

const USAGE_OPTIONS = ["unused", "all"] as const satisfies readonly AttachmentUsageFilter[];
const SORT_OPTIONS = ["size", "name"] as const satisfies readonly AttachmentSort[];

export function AttachmentToolbar({ filters }: { filters: AttachmentFilters }) {
	const { t } = useTranslation("settings.general");
	return (
		<div className="attachmentToolbar">
			<div className="attachmentTabs" role="tablist" aria-label={t("attachments.usageFilter")}>
				{USAGE_OPTIONS.map((option) => (
					<button
						key={option}
						type="button"
						role="tab"
						aria-selected={filters.usage === option}
						className="attachmentTab"
						data-active={filters.usage === option || undefined}
						onClick={() => filters.setUsage(option)}
					>
						{t(`attachments.usage.${option}`)}
					</button>
				))}
			</div>
			<label className="attachmentSearch">
				<HugeiconsIcon icon={Search01Icon} size="var(--icon-sm)" aria-hidden="true" />
				<input
					type="search"
					value={filters.query}
					placeholder={t("attachments.searchPlaceholder")}
					aria-label={t("attachments.searchPlaceholder")}
					onChange={(event) => filters.setQuery(event.target.value)}
				/>
			</label>
			<SettingsSelect
				className="attachmentSelect"
				value={filters.sort}
				aria-label={t("attachments.sortLabel")}
				options={SORT_OPTIONS.map((option) => ({
					value: option,
					label: t(`attachments.sort.${option}`),
				}))}
				onValueChange={filters.setSort}
			/>
		</div>
	);
}
