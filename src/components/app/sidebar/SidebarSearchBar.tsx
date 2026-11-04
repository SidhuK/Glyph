import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { formatShortcutForPlatform } from "@/lib/shortcuts/platform";
import type { SidebarVisibilityKey } from "@/lib/settings/model";
import { SearchIcon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import type { SidebarGetBinding } from "./sidebarContentProps";

interface SidebarSearchBarProps {
	"data-sidebar-key": SidebarVisibilityKey;
	onOpenSearch: () => void;
	getBinding: SidebarGetBinding;
}

/** Input-like field that opens the search palette; the rail keeps its icon. */
export function SidebarSearchBar({
	"data-sidebar-key": sidebarKey,
	onOpenSearch,
	getBinding,
}: SidebarSearchBarProps) {
	const { t } = useTranslation("shell");
	const searchShortcut = getBinding("open-command-palette") ?? getBinding("quick-open");
	const searchShortcutLabel = searchShortcut ? formatShortcutForPlatform(searchShortcut) : "";
	const searchPlaceholder =
		t("sidebar.searchPlaceholder") !== "sidebar.searchPlaceholder"
			? t("sidebar.searchPlaceholder")
			: t("sidebar.search");

	return (
		<button
			type="button"
			className="sidebarSearchBar"
			data-sidebar-key={sidebarKey}
			aria-label={t("sidebar.search")}
			title={
				searchShortcutLabel
					? `${t("sidebar.search")} (${searchShortcutLabel})`
					: t("sidebar.search")
			}
			onClick={onOpenSearch}
		>
			<HugeiconsIcon
				icon={SearchIcon}
				size="var(--sidebar-search-icon-size, var(--icon-sm))"
				className="sidebarSearchBarIcon"
				aria-hidden="true"
			/>
			<span className="sidebarSearchBarLabel">{searchPlaceholder}</span>
			{searchShortcutLabel ? (
				<span className="sidebarSearchBarShortcut" aria-hidden="true">
					{searchShortcutLabel}
				</span>
			) : null}
		</button>
	);
}
