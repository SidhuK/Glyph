import type { ReactNode } from "react";
import { Trash2 } from "../Icons";
import { FolderOpen } from "../Icons/NavigationIcons";
import { Button } from "../ui/shadcn/button";

interface SettingsFolderPickerProps {
	path: string;
	browseLabel: string;
	clearLabel?: string;
	onBrowse: () => void;
	onClear?: () => void;
	helper?: ReactNode;
	error?: ReactNode;
}

export function SettingsFolderPicker({
	path,
	browseLabel,
	clearLabel,
	onBrowse,
	onClear,
	helper,
	error,
}: SettingsFolderPickerProps) {
	return (
		<div className="dailyNotesFolderField">
			<div className="dailyNotesFolderRow">
				<div className="dailyNotesFolderPath">{path}</div>
				<div className="settingsActions dailyNotesActions">
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="min-w-24 rounded-md border-border bg-background justify-center shadow-none"
						onClick={onBrowse}
					>
						<FolderOpen size="var(--icon-md)" />
						{browseLabel}
					</Button>
					{onClear && clearLabel ? (
						<Button
							type="button"
							variant="outline"
							size="icon-sm"
							className="rounded-md border-border bg-background justify-center shadow-none"
							onClick={onClear}
							aria-label={clearLabel}
							title={clearLabel}
						>
							<Trash2 size="var(--icon-md)" />
						</Button>
					) : null}
				</div>
			</div>
			{helper ? <div className="settingsHelp">{helper}</div> : null}
			{error ? (
				<div className="settingsError dailyNotesError">{error}</div>
			) : null}
		</div>
	);
}
