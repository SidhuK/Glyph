import type { DatabaseConfig } from "../../lib/database/types";
import { Button } from "../ui/shadcn/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/shadcn/dialog";
import { Input } from "../ui/shadcn/input";
import { DatabaseFolderPicker } from "./DatabaseFolderPicker";
import { DatabaseTagPicker } from "./DatabaseTagPicker";

interface DatabaseSourceDialogProps {
	open: boolean;
	config: DatabaseConfig;
	onOpenChange: (open: boolean) => void;
	onChangeConfig: (config: DatabaseConfig) => Promise<void>;
}

export function DatabaseSourceDialog({
	open,
	config,
	onOpenChange,
	onChangeConfig,
}: DatabaseSourceDialogProps) {
	const handleSave = async (patch: Partial<DatabaseConfig["source"]>) => {
		await onChangeConfig({
			...config,
			source: {
				...config.source,
				...patch,
			},
		});
	};

	const handleNewNoteFolder = async (folder: string) => {
		await onChangeConfig({
			...config,
			new_note: {
				...config.new_note,
				folder,
			},
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="databaseDialog">
				<DialogHeader>
					<DialogTitle>Source</DialogTitle>
					<DialogDescription>
						Pick the row source and note destination.
					</DialogDescription>
				</DialogHeader>
				<div className="databaseDialogBody databaseDialogBodyTight">
					<section className="settingsCard databaseSettingsCard">
						<div className="settingsCardHeader">
							<div>
								<div className="settingsCardTitle">Rows</div>
							</div>
						</div>
						<div className="settingsField">
							<div>
								<label className="settingsLabel" htmlFor="databaseSourceKind">
									Source Type
								</label>
							</div>
							<select
								id="databaseSourceKind"
								className="databaseNativeSelect"
								value={config.source.kind}
								onChange={(event) =>
									void handleSave({
										kind: event.target
											.value as DatabaseConfig["source"]["kind"],
									})
								}
							>
								<option value="folder">Folder</option>
								<option value="tag">Tag</option>
								<option value="search">Search</option>
							</select>
						</div>
						<div className="settingsField">
							<div>
								<div className="settingsLabel">Source Value</div>
							</div>
							{config.source.kind === "folder" ? (
								<DatabaseFolderPicker
									value={config.source.value}
									label="Database Folder"
									description="Pick the folder whose notes should appear as rows in this database."
									placeholder="Choose a folder"
									onChange={(value) => void handleSave({ value })}
								/>
							) : config.source.kind === "tag" ? (
								<DatabaseTagPicker
									value={config.source.value}
									label="Database Tag"
									description="Choose a tag and this database will stay focused on notes using it."
									placeholder="Choose a tag"
									onChange={(value) => void handleSave({ value })}
								/>
							) : (
								<Input
									id="databaseSourceValue"
									value={config.source.value}
									placeholder={'tag:projects "roadmap"'}
									onChange={(event) =>
										void handleSave({
											value: event.target.value,
										})
									}
								/>
							)}
						</div>
						<div className="settingsField">
							<div>
								<div className="settingsLabel">Folder Scope</div>
							</div>
							<label className="databaseDialogToggle databaseToggleBlock">
								<input
									type="checkbox"
									checked={config.source.recursive}
									disabled={config.source.kind !== "folder"}
									onChange={(event) =>
										void handleSave({
											recursive: event.target.checked,
										})
									}
								/>
								<span>Include subfolders</span>
							</label>
						</div>
					</section>
					<section className="settingsCard databaseSettingsCard">
						<div className="settingsCardHeader">
							<div>
								<div className="settingsCardTitle">New Rows</div>
							</div>
						</div>
						<div className="settingsField">
							<div>
								<div className="settingsLabel">Target Folder</div>
							</div>
							<DatabaseFolderPicker
								value={config.new_note.folder}
								label="New Row Folder"
								description="Choose where new notes created from this database should be stored."
								placeholder="Choose a folder"
								onChange={(value) => void handleNewNoteFolder(value)}
							/>
						</div>
						<div className="settingsField">
							<div>
								<label className="settingsLabel" htmlFor="databaseTitlePrefix">
									Title Prefix
								</label>
							</div>
							<Input
								id="databaseTitlePrefix"
								value={config.new_note.title_prefix}
								placeholder="Untitled"
								onChange={(event) =>
									void onChangeConfig({
										...config,
										new_note: {
											...config.new_note,
											title_prefix: event.target.value,
										},
									})
								}
							/>
						</div>
					</section>
				</div>
				<div className="databaseDialogActions">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Close
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
