import { useTranslation } from "react-i18next";
import { useFileTreeSortMode } from "../../hooks/useFileTreeSortMode";
import {
	FILE_TREE_SORT_MODES,
	fileTreeSortLabel,
} from "../../lib/fileTreeSort";
import { isFileTreeSortMode } from "../../lib/settings";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";
import { SettingsSelect } from "./SettingsSelect";
import type { SettingsBoolean } from "./useSettingsBoolean";

interface FileTreeSettingsSectionProps {
	folderCounts: SettingsBoolean;
	nonMarkdownFiles: SettingsBoolean;
	setError: (message: string) => void;
}

export function FileTreeSettingsSection({
	folderCounts,
	nonMarkdownFiles,
	setError,
}: FileTreeSettingsSectionProps) {
	const { t } = useTranslation(["settings.general", "shell"]);
	const fileTreeSort = useFileTreeSortMode({ onError: setError });

	return (
		<SettingsSection
			title={t("settings.general:fileTree.sectionTitle")}
			description={t("settings.general:fileTree.sectionDescription")}
		>
			<SettingsRow
				label={t("settings.general:fileTree.folderCounts.label")}
				description={t("settings.general:fileTree.folderCounts.description")}
			>
				<SettingsToggle
					checked={folderCounts.checked}
					disabled={folderCounts.isSaving}
					ariaLabel={t("settings.general:fileTree.folderCounts.ariaLabel")}
					onCheckedChange={folderCounts.onCheckedChange}
				/>
			</SettingsRow>
			<SettingsRow
				label={t("settings.general:fileTree.nonMarkdownFiles.label")}
				description={t(
					"settings.general:fileTree.nonMarkdownFiles.description",
				)}
			>
				<SettingsToggle
					checked={nonMarkdownFiles.checked}
					disabled={nonMarkdownFiles.isSaving}
					ariaLabel={t("settings.general:fileTree.nonMarkdownFiles.ariaLabel")}
					onCheckedChange={nonMarkdownFiles.onCheckedChange}
				/>
			</SettingsRow>
			<SettingsRow
				label={t("settings.general:fileTree.sort.label")}
				description={t("settings.general:fileTree.sort.description")}
				interactive={false}
			>
				<SettingsSelect
					aria-label={t("settings.general:fileTree.sort.ariaLabel")}
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
