import { Folder01Icon, NotebookIcon, Search01Icon, Tag01Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import type { DatabaseConfig } from "../../lib/database/types";
import { Input } from "../ui/shadcn/input";
import { Select, SelectIcon } from "../ui/shadcn/select";
import { DatabaseFolderPicker } from "./DatabaseFolderPicker";
import { DatabaseTagPicker } from "./DatabaseTagPicker";

const SOURCE_KIND_ICONS = {
	all_notes: NotebookIcon,
	folder: Folder01Icon,
	tag: Tag01Icon,
	search: Search01Icon,
} as const satisfies Record<DatabaseConfig["source"]["kind"], unknown>;

const SOURCE_KINDS = [
	"all_notes",
	"folder",
	"tag",
	"search",
] as const satisfies readonly DatabaseConfig["source"]["kind"][];

interface SourcePanelProps {
	config: DatabaseConfig;
	updateConfig: (config: DatabaseConfig) => Promise<boolean>;
}

export function SourcePanel({ config, updateConfig }: SourcePanelProps) {
	const { t } = useTranslation("shell");
	return (
		<>
			<p className="databaseViewPanelHint">{t("collections.source.hint")}</p>
			<div className="databaseViewPanelStack">
				<label className="databaseViewField">
					<span>{t("collections.source.showFrom")}</span>
					<Select
						value={config.source.kind}
						options={SOURCE_KINDS.map((kind) => ({
							value: kind,
							label: t(`collections.source.kinds.${kind}`),
							icon: <SelectIcon icon={SOURCE_KIND_ICONS[kind]} />,
						}))}
						onValueChange={(kind) =>
							void updateConfig({ ...config, source: { ...config.source, kind } })
						}
					/>
				</label>
				{config.source.kind === "folder" ? (
					<>
						<div className="databaseViewField">
							<span>{t("collections.source.folder")}</span>
							<DatabaseFolderPicker
								value={config.source.value}
								placeholder={t("collections.source.chooseFolder")}
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
							<span>{t("collections.source.includeSubfolders")}</span>
						</label>
					</>
				) : null}
				{config.source.kind === "tag" ? (
					<DatabaseTagPicker
						value={config.source.value}
						label={t("collections.source.tag")}
						description={t("collections.source.tagDescription")}
						placeholder={t("collections.source.chooseTag")}
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
						<span>{t("collections.source.searchQuery")}</span>
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
					<span>{t("collections.source.saveNewIn")}</span>
					<DatabaseFolderPicker
						value={config.new_note.folder}
						placeholder={t("collections.source.folder")}
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
		</>
	);
}
