import { useEffect, useState } from "react";
import { useFileTreeSortMode } from "../../hooks/useFileTreeSortMode";
import {
	FILE_TREE_SORT_OPTIONS,
	isFileTreeSortMode,
	loadSettings,
	setShowFileTreeFolderCounts,
	setShowNonMarkdownFiles,
} from "../../lib/settings";
import { useTauriEvent } from "../../lib/tauriEvents";
import { SettingsRow, SettingsSection, SettingsToggle } from "./SettingsScaffold";
import { SettingsSelect } from "./SettingsSelect";
import { useOptimisticSettingsToggle } from "./useOptimisticSettingsToggle";

export function FileTreeSettingsSection() {
	const [folderCounts, setFolderCounts] = useState(false);
	const [nonMarkdownFiles, setNonMarkdownFiles] = useState(true);
	const [error, setError] = useState("");
	const fileTreeSort = useFileTreeSortMode({ onError: setError });
	const folderCountsToggle = useOptimisticSettingsToggle(folderCounts, setFolderCounts, setShowFileTreeFolderCounts, setError);
	const nonMarkdownFilesToggle = useOptimisticSettingsToggle(nonMarkdownFiles, setNonMarkdownFiles, setShowNonMarkdownFiles, setError);

	useEffect(() => {
		void loadSettings().then((settings) => {
			setFolderCounts(settings.ui.showFileTreeFolderCounts);
			setNonMarkdownFiles(settings.ui.showNonMarkdownFiles);
		}).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
	}, []);

	useTauriEvent("settings:updated", (payload) => {
		if (typeof payload.ui?.showFileTreeFolderCounts === "boolean") setFolderCounts(payload.ui.showFileTreeFolderCounts);
		if (typeof payload.ui?.showNonMarkdownFiles === "boolean") setNonMarkdownFiles(payload.ui.showNonMarkdownFiles);
	});

	return <SettingsSection title="File tree" description="Choose what appears in the sidebar file tree and Folio list.">
		{error ? <div className="settingsError">{error}</div> : null}
		<SettingsRow label="Show folder file counts" description="Show a recursive file total at the end of each folder row in the file tree."><SettingsToggle checked={folderCounts} disabled={folderCountsToggle.isSaving} ariaLabel="Show folder file counts" onCheckedChange={folderCountsToggle.onCheckedChange} /></SettingsRow>
		<SettingsRow label="Show non-Markdown files" description="Show PDFs, images, and other attachments in the file tree and Folio list. Turning this off hides them from those views only."><SettingsToggle checked={nonMarkdownFiles} disabled={nonMarkdownFilesToggle.isSaving} ariaLabel="Show non-Markdown files" onCheckedChange={nonMarkdownFilesToggle.onCheckedChange} /></SettingsRow>
		<SettingsRow label="File tree sort" description="Choose how folders and files are ordered in the sidebar tree." interactive={false}><SettingsSelect aria-label="File tree sort" value={fileTreeSort.sortMode} disabled={fileTreeSort.isSaving} onChange={(event) => { const mode = event.currentTarget.value; if (isFileTreeSortMode(mode)) void fileTreeSort.setSortMode(mode); }}>{FILE_TREE_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SettingsSelect></SettingsRow>
	</SettingsSection>;
}
