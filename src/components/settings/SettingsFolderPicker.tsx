import { Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface SettingsFolderPickerProps {
	path: string;
	empty?: boolean;
	browseLabel: string;
	clearLabel?: string;
	clearText?: string;
	onBrowse: () => void;
	onClear?: () => void;
	error?: ReactNode;
}

export function SettingsFolderPicker({
	path,
	empty = false,
	browseLabel,
	clearLabel,
	clearText,
	onBrowse,
	onClear,
	error,
}: SettingsFolderPickerProps) {
	const { t } = useTranslation("settings.general");
	const handleBrowseButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		onBrowse();
	};
	return (
		<div className="dailyNotesFolderField">
			<div className="dailyNotesFolderRow">
				{onClear && clearLabel ? (
					<button
						type="button"
						className="settingsFolderTextButton"
						onClick={onClear}
						aria-label={clearLabel}
						title={clearLabel}
					>
						{clearText ?? t("folderPicker.clear")}
					</button>
				) : null}
				<div className="settingsFolderBox" data-empty={empty || undefined} onClick={onBrowse}>
					<HugeiconsIcon icon={Folder01Icon} size={14} className="settingsFolderBoxIcon" />
					<span className="settingsFolderBoxPath" title={path}>
						{path}
					</span>
					<button type="button" className="settingsFolderBrowse" onClick={handleBrowseButtonClick}>
						{browseLabel}
					</button>
				</div>
			</div>
			{error ? <div className="settingsError dailyNotesError">{error}</div> : null}
		</div>
	);
}
