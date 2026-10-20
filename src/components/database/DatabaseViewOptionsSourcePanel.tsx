import type { DatabaseConfig } from "../../lib/database/types";
import { Input } from "../ui/shadcn/input";
import { Select, type SelectOption } from "../ui/shadcn/select";
import { DatabaseFolderPicker } from "./DatabaseFolderPicker";
import { DatabaseTagPicker } from "./DatabaseTagPicker";

const SOURCE_KIND_OPTIONS: SelectOption<DatabaseConfig["source"]["kind"]>[] = [
	{ value: "all_notes", label: "All notes" },
	{ value: "folder", label: "A folder" },
	{ value: "tag", label: "A tag" },
	{ value: "search", label: "A search query" },
];

interface SourcePanelProps {
	config: DatabaseConfig;
	updateConfig: (config: DatabaseConfig) => Promise<boolean>;
}

export function SourcePanel({ config, updateConfig }: SourcePanelProps) {
	return (
		<section className="databaseViewOptionsPanel" aria-label="Source">
			<div className="databaseViewPanelHeader">
				<span>Source</span>
			</div>
			<p className="databaseViewPanelHint">
				Choose which notes appear in this view. Changes save automatically.
			</p>
			<div className="databaseViewPanelStack">
				<label className="databaseViewField">
					<span>Show notes from</span>
					<Select
						value={config.source.kind}
						options={SOURCE_KIND_OPTIONS}
						onValueChange={(kind) =>
							void updateConfig({ ...config, source: { ...config.source, kind } })
						}
					/>
				</label>
				{config.source.kind === "folder" ? (
					<>
						<div className="databaseViewField">
							<span>Folder</span>
							<DatabaseFolderPicker
								value={config.source.value}
								placeholder="Choose a folder"
								triggerClassName="databaseSourceInlinePicker"
								onChange={(value) =>
									void updateConfig({
										...config,
										source: { ...config.source, value },
									})
								}
							/>
						</div>
						<label className="databaseViewCheckRow">
							<input
								type="checkbox"
								checked={config.source.recursive}
								onChange={(event) =>
									void updateConfig({
										...config,
										source: {
											...config.source,
											recursive: event.target.checked,
										},
									})
								}
							/>
							<span>Include subfolders</span>
						</label>
					</>
				) : null}
				{config.source.kind === "tag" ? (
					<DatabaseTagPicker
						value={config.source.value}
						label="Tag"
						description="Only notes with this tag will appear."
						placeholder="Choose a tag"
						onChange={(value) =>
							void updateConfig({
								...config,
								source: { ...config.source, value },
							})
						}
					/>
				) : null}
				{config.source.kind === "search" ? (
					<label className="databaseViewField" htmlFor="databaseViewSourceQuery">
						<span>Search query</span>
						<Input
							id="databaseViewSourceQuery"
							value={config.source.value}
							placeholder={'tag:projects "roadmap"'}
							onChange={(event) =>
								void updateConfig({
									...config,
									source: { ...config.source, value: event.target.value },
								})
							}
						/>
					</label>
				) : null}
				<div className="databaseViewField">
					<span>Save new notes in</span>
					<DatabaseFolderPicker
						value={config.new_note.folder}
						placeholder="Folder"
						triggerClassName="databaseSourceInlinePicker"
						onChange={(folder) =>
							void updateConfig({
								...config,
								new_note: { ...config.new_note, folder },
							})
						}
					/>
				</div>
			</div>
		</section>
	);
}
