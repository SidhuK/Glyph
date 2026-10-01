import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { readRecentIconIds } from "../../lib/appearancePickerRecents";
import { isAppearanceEmoji, loadAppearanceEmojiGroups } from "../../lib/appearanceEmoji";
import {
	type DatabaseColumnIconOption,
	ICON_CATEGORIES,
	getDatabaseColumnIconOption,
} from "../../lib/database/columnIcons";

export type AppearancePickerMode = "icons" | "emoji";

export interface AppearancePickerOption {
	id: string;
	label: string;
}

export interface AppearancePickerGroup {
	id: string;
	label: string;
	tabIconName: string;
	options: readonly AppearancePickerOption[];
}

const RECENT_GROUP_ID = "recent";
const RECENT_TAB_ICON = "clock";

interface UseAppearancePickerGroupsArgs {
	mode: AppearancePickerMode;
	open: boolean;
	query: string;
	iconOptions: readonly DatabaseColumnIconOption[];
}

/** Builds the sectioned grid content for the active picker mode, search query, and recents. */
export function useAppearancePickerGroups({
	mode,
	open,
	query,
	iconOptions,
}: UseAppearancePickerGroupsArgs) {
	const { t } = useTranslation("shell");
	const emojiQuery = useQuery({
		queryKey: ["appearance-picker", "emoji-groups"],
		queryFn: loadAppearanceEmojiGroups,
		staleTime: Number.POSITIVE_INFINITY,
		enabled: open && mode === "emoji",
	});

	const emojiLabels = useMemo(
		() =>
			new Map(
				(emojiQuery.data ?? []).flatMap((group) =>
					group.options.map((option) => [option.id, option.label] as const),
				),
			),
		[emojiQuery.data],
	);

	const recentIds = useMemo(() => (open ? readRecentIconIds() : []), [open]);

	const groups = useMemo((): AppearancePickerGroup[] => {
		const recentOptions: AppearancePickerOption[] = [];
		for (const id of recentIds) {
			const option =
				mode === "emoji"
					? isAppearanceEmoji(id) && { id, label: emojiLabels.get(id) ?? id }
					: iconOptions.find((iconOption) => iconOption.id === id);
			if (option) recentOptions.push(option);
		}

		const sections: AppearancePickerGroup[] =
			mode === "emoji"
				? (emojiQuery.data ?? []).map((group) => ({
						id: group.id,
						label: t(`appearancePicker.emojiGroups.${group.id}`),
						tabIconName: group.options[0]?.id ?? "",
						options: group.options,
					}))
				: ICON_CATEGORIES.map((category) => {
						const options = iconOptions.filter((option) => option.category === category);
						return {
							id: category,
							label: t(`appearancePicker.categories.${category}`),
							tabIconName: options[0]?.id ?? "",
							options,
						};
					});
		const filledSections = sections.filter((section) => section.options.length > 0);

		if (query) {
			const results = filledSections.flatMap((section) =>
				section.options.filter(
					(option) =>
						option.id.includes(query) ||
						option.label.toLowerCase().includes(query) ||
						section.label.toLowerCase().includes(query),
				),
			);
			return [{ id: "results", label: "", tabIconName: "", options: results }];
		}
		if (recentOptions.length === 0) return filledSections;
		return [
			{
				id: RECENT_GROUP_ID,
				label: t("appearancePicker.recent"),
				tabIconName: RECENT_TAB_ICON,
				options: recentOptions,
			},
			...filledSections,
		];
	}, [emojiLabels, emojiQuery.data, iconOptions, mode, query, recentIds, t]);

	function labelFor(iconName: string | null | undefined): string | null {
		if (!iconName) return null;
		if (isAppearanceEmoji(iconName)) return emojiLabels.get(iconName) ?? iconName;
		return getDatabaseColumnIconOption(iconName)?.label ?? null;
	}

	return {
		groups,
		results: groups.flatMap((group) => group.options),
		loading: mode === "emoji" && emojiQuery.isPending,
		error: mode === "emoji" && emojiQuery.isError,
		labelFor,
	};
}
