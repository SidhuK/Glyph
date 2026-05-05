import type { DatabaseConfig } from "../../lib/database/types";
import { Input } from "../ui/shadcn/input";
import { DatabaseFolderPicker } from "./DatabaseFolderPicker";
import { DatabaseTagPicker } from "./DatabaseTagPicker";

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
			<div className="databaseViewPanelStack">
				<label className="databaseViewField">
					<span>Source</span>
					<select
						className="databaseNativeSelect"
						value={config.source.kind}
						onChange={(event) =>
							void updateConfig({
								...config,
								source: {
									...config.source,
									kind: event.target.value as DatabaseConfig["source"]["kind"],
								},
							})
						}
					>
						<option value="all_notes">All notes</option>
						<option value="folder">Folder</option>
						<option value="tag">Tag</option>
						<option value="search">Search</option>
					</select>
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
						label="Database Tag"
						description="Choose a tag for this database."
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
					<label
						className="databaseViewField"
						htmlFor="databaseViewSourceQuery"
					>
						<span>Query</span>
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
