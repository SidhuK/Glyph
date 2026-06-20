import type { DatabaseConfig } from "../../lib/database/types";
import { Input } from "../ui/shadcn/input";
import { DatabaseFolderPicker } from "./DatabaseFolderPicker";
import { DatabaseTagPicker } from "./DatabaseTagPicker";

interface SourcePanelProps {
	config: DatabaseConfig;
	updateConfig: (config: DatabaseConfig) => Promise<boolean>;
}

export function SourcePanel({ config, updateConfig }: SourcePanelProps) {
	const { t } = useTranslation("ui");
	return (
		<section
			className="databaseViewOptionsPanel"
			aria-label={t("database.source")}
		>
			<div className="databaseViewPanelHeader">
				<span>{t("database.source")}</span>
			</div>
			<div className="databaseViewPanelStack">
				<label className="databaseViewField">
					<span>{t("database.source")}</span>
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
						<option value="all_notes">{t("database.allNotes")}</option>
						<option value="folder">{t("database.folder")}</option>
						<option value="tag">{t("database.tag")}</option>
						<option value="search">{t("database.search")}</option>
					</select>
				</label>
				{config.source.kind === "folder" ? (
					<>
						<div className="databaseViewField">
							<span>{t("database.folder")}</span>
							<DatabaseFolderPicker
								value={config.source.value}
								placeholder={t("database.chooseFolder")}
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
							<span>{t("database.includeSubfolders")}</span>
						</label>
					</>
				) : null}
				{config.source.kind === "tag" ? (
					<DatabaseTagPicker
						value={config.source.value}
						label={t("database.databaseTag")}
						description={t("database.chooseTagDescription")}
						placeholder={t("database.chooseTag")}
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
						<span>{t("database.query")}</span>
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
					<span>{t("database.saveNewNotesIn")}</span>
					<DatabaseFolderPicker
						value={config.new_note.folder}
						placeholder={t("database.folder")}
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
import { useTranslation } from "react-i18next";
