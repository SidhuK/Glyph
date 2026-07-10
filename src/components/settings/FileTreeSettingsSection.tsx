import { useFileTreeSortMode } from "../../hooks/useFileTreeSortMode";
import { FILE_TREE_SORT_OPTIONS, isFileTreeSortMode } from "../../lib/settings";
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
	const fileTreeSort = useFileTreeSortMode({ onError: setError });

	return (
		<SettingsSection
			title="File tree"
			description="Choose what appears in the sidebar file tree and Folio list."
		>
			<SettingsRow
				label="Show folder file counts"
				description="Show a recursive file total at the end of each folder row in the file tree."
			>
				<SettingsToggle
					checked={folderCounts.checked}
					disabled={folderCounts.isSaving}
					ariaLabel="Show folder file counts"
					onCheckedChange={folderCounts.onCheckedChange}
				/>
			</SettingsRow>
			<SettingsRow
				label="Show non-Markdown files"
				description="Show PDFs, images, and other attachments in the file tree and Folio list. Turning this off hides them from those views only."
			>
				<SettingsToggle
					checked={nonMarkdownFiles.checked}
					disabled={nonMarkdownFiles.isSaving}
					ariaLabel="Show non-Markdown files"
					onCheckedChange={nonMarkdownFiles.onCheckedChange}
				/>
			</SettingsRow>
			<SettingsRow
				label="File tree sort"
				description="Choose how folders and files are ordered in the sidebar tree."
				interactive={false}
			>
				<SettingsSelect
					aria-label="File tree sort"
					value={fileTreeSort.sortMode}
					disabled={fileTreeSort.isSaving}
					onChange={(event) => {
						const mode = event.currentTarget.value;
						if (isFileTreeSortMode(mode)) void fileTreeSort.setSortMode(mode);
					}}
				>
					{FILE_TREE_SORT_OPTIONS.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</SettingsSelect>
			</SettingsRow>
		</SettingsSection>
	);
}
