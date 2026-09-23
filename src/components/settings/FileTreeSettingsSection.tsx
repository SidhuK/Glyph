import { useTranslation } from "react-i18next";
import { useFileTreeSortMode } from "../../hooks/useFileTreeSortMode";
import { FILE_TREE_SORT_MODES, fileTreeSortLabel } from "../../lib/fileTreeSort";
import { isFileTreeSortMode } from "../../lib/settings";
import { SettingsRow, SettingsSection, SettingsToggle } from "./SettingsScaffold";
import { SettingsSelect } from "./SettingsSelect";
import type { SettingsBoolean } from "./useSettingsBoolean";

interface FileTreeSettingsSectionProps {
	folderCounts: SettingsBoolean;
	setError: (message: string) => void;
}

export function FileTreeSettingsSection({ folderCounts, setError }: FileTreeSettingsSectionProps) {
	const { t } = useTranslation("settings.general");
	const fileTreeSort = useFileTreeSortMode({ onError: setError });

	return (
		<SettingsSection
			title={t("fileTree.sectionTitle")}
			description={t("fileTree.sectionDescription")}
		>
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
					onChange={(event) => {
						const mode = event.currentTarget.value;
						if (isFileTreeSortMode(mode)) void fileTreeSort.setSortMode(mode);
					}}
				>
					{FILE_TREE_SORT_MODES.map((mode) => (
						<option key={mode} value={mode}>
							{fileTreeSortLabel(mode)}
						</option>
					))}
				</SettingsSelect>
			</SettingsRow>
		</SettingsSection>
	);
}
