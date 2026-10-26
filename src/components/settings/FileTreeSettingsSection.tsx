import { useTranslation } from "react-i18next";
import { SelectIcon } from "../ui/shadcn/select";
import { FILE_TREE_SORT_ICONS } from "../filetree/fileTreeSortIcons";
import { useFileTreeSortMode } from "../../hooks/useFileTreeSortMode";
import { FILE_TREE_SORT_MODES, fileTreeSortLabel } from "../../lib/fileTreeSort";
import { SettingsRow, SettingsSection, SettingsToggle } from "./SettingsScaffold";
import { SettingsSelect } from "./SettingsSelect";
import type { SettingsBoolean } from "./useSettingsBoolean";

interface FileTreeSettingsSectionProps {
	folderCounts: SettingsBoolean;
	setError: (message: string) => void;
}

/** File tree sort modes as select options; the Folio sort setting reuses them. */
export function fileTreeSortOptions() {
	return FILE_TREE_SORT_MODES.map((mode) => ({
		value: mode,
		label: fileTreeSortLabel(mode),
		icon: <SelectIcon icon={FILE_TREE_SORT_ICONS[mode]} />,
	}));
}

export function FileTreeSettingsSection({ folderCounts, setError }: FileTreeSettingsSectionProps) {
	const { t } = useTranslation("settings.general");
	const fileTreeSort = useFileTreeSortMode({ onError: setError });

	return (
		<SettingsSection title={t("fileTree.sectionTitle")}>
			<SettingsRow
				label={t("fileTree.folderCounts.label")}
				description={t("fileTree.folderCounts.description")}
			>
				<SettingsToggle
					checked={folderCounts.checked}
					disabled={folderCounts.isSaving}
					ariaLabel={t("fileTree.folderCounts.ariaLabel")}
					onCheckedChange={folderCounts.onCheckedChange}
				/>
			</SettingsRow>
			<SettingsRow
				label={t("fileTree.sort.label")}
				description={t("fileTree.sort.description")}
				interactive={false}
			>
				<SettingsSelect
					aria-label={t("fileTree.sort.ariaLabel")}
					value={fileTreeSort.sortMode}
					disabled={fileTreeSort.isSaving}
					options={fileTreeSortOptions()}
					onValueChange={(mode) => void fileTreeSort.setSortMode(mode)}
				/>
			</SettingsRow>
		</SettingsSection>
	);
}
