import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/shadcn/button";

interface SettingsFolderPickerProps {
	path: string;
	/** The path is placeholder text ("Not configured"), so it reads quieter than a set value. */
	empty?: boolean;
	browseLabel: string;
	clearLabel?: string;
	/** Visible text of the clear button; defaults to "Clear". */
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
	return (
		<div className="dailyNotesFolderField">
			<div className="dailyNotesFolderRow">
				<div className="dailyNotesFolderPath" data-empty={empty || undefined} title={path}>
					{path}
				</div>
				<div className="settingsActions dailyNotesActions">
					{onClear && clearLabel ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={onClear}
							aria-label={clearLabel}
							title={clearLabel}
						>
							{clearText ?? t("folderPicker.clear")}
						</Button>
					) : null}
					<Button type="button" variant="outline" size="sm" onClick={onBrowse}>
						{browseLabel}
					</Button>
				</div>
			</div>
			{error ? <div className="settingsError dailyNotesError">{error}</div> : null}
		</div>
	);
}
